import { SignConfig, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector'
import type { NormalizedComment } from './types.js'

type Slot = {
  connection: TikTokLiveConnection
  buffer: NormalizedComment[]
  connecting: Promise<unknown> | null
  eulerWs: WebSocket | null
  eulerConnecting: Promise<boolean> | null
}

export class TikTokLiveConnectorPool {
  private slots = new Map<string, Slot>()
  readonly hasApiKey: boolean

  constructor(private signApiKey?: string) {
    this.hasApiKey = Boolean(signApiKey)
    if (signApiKey) SignConfig.apiKey = signApiKey
  }

  async probeProvider() {
    if (!this.signApiKey) throw new Error('euler_api_key_missing')
    const response = await fetch('https://api.eulerstream.com/accounts/me/rate_limits', { headers: { 'X-Api-Key': this.signApiKey } })
    let data: unknown = null
    try { data = await response.json() } catch { data = null }
    return { ok: response.ok, status: response.status, data }
  }

  private pushComment(slot: Slot, key: string, raw: any, provider = 'connector') {
    const data = raw?.data || raw?.payload || raw
    const user = data?.user || data?.author || {}
    const text = String(data?.comment || data?.text || data?.content || '')
    if (!text.trim()) return
    const now = new Date().toISOString()
    const username = String(user?.uniqueId || user?.unique_id || user?.username || data?.uniqueId || data?.unique_id || 'unknown').replace(/^@/, '')
    const userId = user?.userId || user?.id || user?.user_id || data?.userId || null
    const externalId = String(data?.msgId || data?.msg_id || data?.id || raw?.id || `${userId || username}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
    slot.buffer.push({
      externalId,
      username,
      displayName: user?.nickname || user?.displayName || user?.display_name || data?.nickname || null,
      userId: userId ? String(userId) : null,
      text,
      createdAt: now,
      sourceType: 'live',
      sourceAccount: key,
      sourceContentId: slot.connection.roomId || data?.roomId || data?.room_id || null,
      sourceUrl: `https://www.tiktok.com/@${key}/live`,
      metadata: { room_id: slot.connection.roomId || data?.roomId || data?.room_id || null, live_provider: provider },
    })
    if (slot.buffer.length > 5000) slot.buffer.splice(0, slot.buffer.length - 5000)
  }

  private slot(username: string) {
    if (!this.signApiKey) throw new Error('euler_api_key_missing')
    const key = username.replace(/^@/, '')
    let slot = this.slots.get(key)
    if (slot) return slot
    const connection = new TikTokLiveConnection(key, { signApiKey: this.signApiKey, processInitialData: false, fetchRoomInfoOnConnect: true })
    slot = { connection, buffer: [], connecting: null, eulerWs: null, eulerConnecting: null }
    connection.on(WebcastEvent.CHAT, (data: any) => this.pushComment(slot!, key, data, 'tiktok-live-connector'))
    this.slots.set(key, slot)
    return slot
  }

  private isOfflineError(err: unknown) {
    const name = typeof err === 'object' && err && 'name' in err ? String((err as any).name || '') : ''
    const message = err instanceof Error ? err.message : String(err)
    return name === 'UserOfflineError' || /isn['’]?t online|user offline|not online|live (?:has )?ended|room.*status.*4|not currently live/i.test(message)
  }

  private async connectEulerWebSocket(key: string, slot: Slot): Promise<boolean> {
    if (!this.signApiKey) throw new Error('euler_api_key_missing')
    if (slot.eulerWs && slot.eulerWs.readyState === WebSocket.OPEN) return true
    if (slot.eulerConnecting) return slot.eulerConnecting
    slot.eulerConnecting = new Promise<boolean>((resolve, reject) => {
      const url = `wss://ws.eulerstream.com?uniqueId=${encodeURIComponent(key)}&apiKey=${encodeURIComponent(this.signApiKey!)}&schemaVersion=v1&features.normalizeUniqueId=true`
      const ws = new WebSocket(url)
      slot.eulerWs = ws
      const timer = setTimeout(() => { try { ws.close() } catch {}; reject(new Error('euler_ws_connect_timeout')) }, 12000)
      ws.addEventListener('open', () => { clearTimeout(timer); console.log(JSON.stringify({event:'euler_ws_connected',username:key,version:'0.6.0'})); resolve(true) }, { once: true })
      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const body = JSON.parse(String(event.data || '{}'))
          const messages = Array.isArray(body?.messages) ? body.messages : [body]
          for (const msg of messages) {
            const type = String(msg?.type || msg?.event || msg?.method || msg?.name || '').toLowerCase()
            if (type.includes('chat') || type.includes('comment') || msg?.comment || msg?.data?.comment || msg?.payload?.comment) this.pushComment(slot, key, msg, 'euler-websocket')
          }
        } catch {}
      })
      ws.addEventListener('close', (event: CloseEvent) => {
        slot.eulerWs = null
        if (event.code !== 1000) console.log(JSON.stringify({event:'euler_ws_closed',username:key,code:event.code,reason:event.reason||null,version:'0.6.0'}))
      })
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('euler_ws_error')) }, { once: true })
    }).finally(() => { slot.eulerConnecting = null })
    return slot.eulerConnecting
  }

  async isLive(username: string) {
    const key = username.replace(/^@/, '')
    const slot = this.slot(key)
    try {
      const live = await slot.connection.fetchIsLive(key)
      if (live && !slot.connection.isConnected && !slot.connecting) {
        slot.connecting = slot.connection.connect().finally(() => { slot.connecting = null })
        await slot.connecting
      }
      if (!live && slot.connection.isConnected) await slot.connection.disconnect()
      return Boolean(live)
    } catch (statusErr) {
      try {
        if (!slot.connection.isConnected && !slot.connecting) {
          slot.connecting = slot.connection.connect().finally(() => { slot.connecting = null })
          await slot.connecting
        }
        if (slot.connection.isConnected) return true
      } catch (connectErr) {
        if (this.isOfflineError(connectErr)) return false
        // Final fallback: EulerStream's own public WebSocket API does not require us to resolve a Room ID first.
        try { return await this.connectEulerWebSocket(key, slot) } catch (wsErr) {
          const statusMessage = statusErr instanceof Error ? statusErr.message : String(statusErr)
          const connectMessage = connectErr instanceof Error ? connectErr.message : String(connectErr)
          const wsMessage = wsErr instanceof Error ? wsErr.message : String(wsErr)
          throw new Error(`live_all_paths_failed | status=${statusMessage} | connector=${connectMessage} | euler_ws=${wsMessage}`)
        }
      }
      return true
    }
  }

  async readLiveComments(username: string, since?: string | null) {
    const slot = this.slot(username)
    const cutoff = since ? new Date(since).getTime() : 0
    const out = slot.buffer.filter(x => new Date(x.createdAt).getTime() > cutoff)
    if (out.length) {
      const newest = new Date(out[out.length - 1].createdAt).getTime()
      slot.buffer = slot.buffer.filter(x => new Date(x.createdAt).getTime() > newest)
    }
    return out
  }

  async disconnectAll() {
    await Promise.all([...this.slots.values()].map(async s => {
      if (s.connection.isConnected) await s.connection.disconnect()
      if (s.eulerWs) { try { s.eulerWs.close(1000, 'shutdown') } catch {} }
    }))
  }
}
