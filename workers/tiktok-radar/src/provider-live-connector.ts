import { SignConfig, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector'
import type { NormalizedComment } from './types.js'

type Slot = {
  connection: TikTokLiveConnection
  buffer: NormalizedComment[]
  connecting: Promise<unknown> | null
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
    const response = await fetch('https://api.eulerstream.com/accounts/me/rate_limits', {
      headers: { 'X-Api-Key': this.signApiKey },
    })
    let data: unknown = null
    try { data = await response.json() } catch { data = null }
    return {
      ok: response.ok,
      status: response.status,
      data,
    }
  }

  private slot(username: string) {
    if (!this.signApiKey) throw new Error('euler_api_key_missing')
    const key = username.replace(/^@/, '')
    let slot = this.slots.get(key)
    if (slot) return slot
    const connection = new TikTokLiveConnection(key, {
      signApiKey: this.signApiKey,
      processInitialData: false,
    })
    slot = { connection, buffer: [], connecting: null }
    connection.on(WebcastEvent.CHAT, (data: any) => {
      const now = new Date().toISOString()
      const user = data?.user || {}
      const externalId = String(data?.msgId || data?.id || `${user.userId || user.uniqueId || 'u'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)
      slot!.buffer.push({
        externalId,
        username: String(user.uniqueId || user.nickname || user.userId || 'unknown'),
        displayName: user.nickname || null,
        userId: user.userId ? String(user.userId) : null,
        text: String(data?.comment || ''),
        createdAt: now,
        sourceType: 'live',
        sourceAccount: key,
        sourceContentId: connection.roomId || null,
        sourceUrl: `https://www.tiktok.com/@${key}/live`,
        metadata: { room_id: connection.roomId || null },
      })
      if (slot!.buffer.length > 5000) slot!.buffer.splice(0, slot!.buffer.length - 5000)
    })
    this.slots.set(key, slot)
    return slot
  }

  async isLive(username: string) {
    const key = username.replace(/^@/, '')
    const slot = this.slot(key)
    const live = await slot.connection.fetchIsLive(key)
    if (live && !slot.connection.isConnected && !slot.connecting) {
      slot.connecting = slot.connection.connect().catch(err => {
        console.error('live_connect_error', key, err instanceof Error ? err.message : String(err))
      }).finally(() => { slot.connecting = null })
      await slot.connecting
    }
    if (!live && slot.connection.isConnected) await slot.connection.disconnect()
    return Boolean(live)
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
    }))
  }
}
