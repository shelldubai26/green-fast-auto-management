import { createClient } from '@supabase/supabase-js'
import { HttpTikTokProvider } from './provider-http.js'
import { TikTokLiveConnectorPool } from './provider-live-connector.js'
import type { NormalizedComment, WatchAccount } from './types.js'

const env = (name: string, required = true) => {
  const v = process.env[name]
  if (required && !v) throw new Error(`missing_env:${name}`)
  return v || ''
}

const SUPABASE_URL = env('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const VIDEO_PROVIDER_BASE_URL = env('RADAR_VIDEO_PROVIDER_BASE_URL', false)
const VIDEO_PROVIDER_TOKEN = env('RADAR_VIDEO_PROVIDER_TOKEN', false)
const EULER_SIGN_API_KEY = env('EULER_SIGN_API_KEY', false)
const LOOP_MS = Number(process.env.RADAR_LOOP_MS || 60_000)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const liveProvider = new TikTokLiveConnectorPool(EULER_SIGN_API_KEY || undefined)
const videoProvider = VIDEO_PROVIDER_BASE_URL ? new HttpTikTokProvider(VIDEO_PROVIDER_BASE_URL, VIDEO_PROVIDER_TOKEN || undefined) : null

const tierMinutes: Record<string, number> = { A: 10, B: 30, C: 120 }
const intentPattern = /(prix|combien|acheter|achat|disponible|stock|cr[eé]dit|financement|acompte|whatsapp|contact|adresse|o[uù]|venir voir|visite|rdv|prado|land cruiser|jetour|t2|x5|suv)/i
const isCandidate = (c: NormalizedComment) => c.text.trim().length >= 2 && intentPattern.test(c.text)

async function loadWatchlist(): Promise<WatchAccount[]> {
  const { data, error } = await supabase
    .from('tiktok_watchlist')
    .select('id,username,display_name,watch_tier,live_monitor,video_comment_monitor,country_code,city,market_scope,is_active')
    .eq('is_active', true)
    .eq('country_code', 'CI')
  if (error) throw error
  return (data || []) as WatchAccount[]
}

async function getState(watchlistId: string, channel: 'live' | 'video_comment') {
  const { data } = await supabase
    .from('tiktok_watcher_state')
    .select('*')
    .eq('watchlist_id', watchlistId)
    .eq('channel', channel)
    .maybeSingle()
  return data
}

async function due(account: WatchAccount, channel: 'live' | 'video_comment') {
  const state = await getState(account.id, channel)
  if (!state?.last_checked_at) return true
  const mins = tierMinutes[account.watch_tier] || 120
  return Date.now() - new Date(state.last_checked_at).getTime() >= mins * 60_000
}

async function saveState(account: WatchAccount, channel: 'live' | 'video_comment', providerName: string, patch: Record<string, unknown>) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('tiktok_watcher_state').upsert({
    watchlist_id: account.id,
    channel,
    provider: providerName,
    last_checked_at: now,
    ...patch,
  }, { onConflict: 'watchlist_id,channel' })
  if (error) throw error
  const watchPatch: Record<string, string> = { last_scan_at: now }
  if (channel === 'live' && patch.live_status === true) watchPatch.last_live_seen_at = now
  if (channel === 'video_comment') watchPatch.last_content_seen_at = now
  await supabase.from('tiktok_watchlist').update(watchPatch).eq('id', account.id)
}

async function ingest(account: WatchAccount, comments: NormalizedComment[], providerName: string) {
  let inserted = 0
  for (const c of comments.filter(isCandidate)) {
    const row = {
      platform: 'tiktok',
      source_event_id: `${c.sourceType}:${c.sourceAccount || account.username}:${c.externalId}`,
      tiktok_user_id: c.userId || null,
      username: c.username,
      display_name: c.displayName || null,
      source_type: c.sourceType,
      source_account: c.sourceAccount || account.username,
      source_url: c.sourceUrl || null,
      source_content_id: c.sourceContentId || null,
      original_text: c.text,
      intent_score: 35,
      status: 'new',
      detected_country_code: account.country_code || 'CI',
      detected_city: account.city || 'Abidjan',
      market_scope: account.market_scope || 'abidjan_auto',
      geo_confidence: 75,
      metadata: { provider: providerName, external_comment_id: c.externalId, ...(c.metadata || {}) },
      first_seen_at: c.createdAt,
      last_seen_at: c.createdAt,
    }
    const { error } = await supabase.from('social_leads').insert(row)
    if (!error) inserted++
    else if (error.code !== '23505') console.error('lead_insert_error', error.message)
  }
  return inserted
}

async function scanLive(account: WatchAccount) {
  if (!account.live_monitor || !(await due(account, 'live'))) return
  const state = await getState(account.id, 'live')
  try {
    const live = await liveProvider.isLive(account.username)
    let found = 0
    let cursor = state?.cursor_value || null
    if (live) {
      const comments = await liveProvider.readLiveComments(account.username, cursor)
      found = await ingest(account, comments, 'tiktok-live-connector')
      cursor = comments.at(-1)?.createdAt || cursor
    }
    await saveState(account, 'live', 'tiktok-live-connector', { live_status: live, cursor_value: cursor, last_success_at: new Date().toISOString(), last_error: null, last_items_seen: found })
  } catch (e) {
    await saveState(account, 'live', 'tiktok-live-connector', { last_error: e instanceof Error ? e.message : String(e) })
  }
}

async function scanVideos(account: WatchAccount) {
  if (!account.video_comment_monitor || !(await due(account, 'video_comment'))) return
  if (!videoProvider) {
    await saveState(account, 'video_comment', 'not-configured', { last_error: 'video_provider_not_configured' })
    return
  }
  const state = await getState(account.id, 'video_comment')
  try {
    const videos = await videoProvider.listRecentVideos(account.username, account.watch_tier === 'A' ? 8 : account.watch_tier === 'B' ? 5 : 3)
    let found = 0
    let newest = state?.cursor_value || null
    for (const video of videos) {
      const comments = await videoProvider.readVideoComments(account.username, video, state?.cursor_value || null)
      found += await ingest(account, comments, videoProvider.name)
      const last = comments.at(-1)?.createdAt
      if (last && (!newest || new Date(last) > new Date(newest))) newest = last
    }
    await saveState(account, 'video_comment', videoProvider.name, { cursor_value: newest, last_success_at: new Date().toISOString(), last_error: null, last_items_seen: found })
  } catch (e) {
    await saveState(account, 'video_comment', videoProvider.name, { last_error: e instanceof Error ? e.message : String(e) })
  }
}

async function cycle() {
  const accounts = await loadWatchlist()
  for (const account of accounts) await Promise.all([scanLive(account), scanVideos(account)])
  console.log(JSON.stringify({ at: new Date().toISOString(), accounts: accounts.length, videoProvider: Boolean(videoProvider) }))
}

async function main() {
  console.log('GF Auto TikTok Radar worker started')
  const shutdown = async () => { await liveProvider.disconnectAll(); process.exit(0) }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  for (;;) {
    try { await cycle() } catch (e) { console.error('cycle_error', e) }
    await new Promise(resolve => setTimeout(resolve, LOOP_MS))
  }
}

void main()
