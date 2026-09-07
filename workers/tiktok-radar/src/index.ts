import { createClient } from '@supabase/supabase-js'
import { HttpTikTokProvider } from './provider-http.js'
import { TikTokLiveConnectorPool } from './provider-live-connector.js'
import { IntentEngine, type IntentResult } from './intent-engine.js'
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
const intentEngine = new IntentEngine(supabase, 'abidjan_auto')

const tierMinutes: Record<string, number> = { A: 10, B: 30, C: 120 }

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

async function startScanRun(account: WatchAccount, channel: 'live'|'video_comment', providerName: string) {
  const { data } = await supabase.from('tiktok_radar_scan_runs').insert({
    watchlist_id: account.id,
    channel,
    provider: providerName,
    started_at: new Date().toISOString(),
  }).select('id').single()
  return data?.id as string | undefined
}

async function finishScanRun(id: string | undefined, patch: Record<string, unknown>) {
  if (!id) return
  await supabase.from('tiktok_radar_scan_runs').update({ completed_at: new Date().toISOString(), ...patch }).eq('id', id)
}

async function evaluateComments(comments: NormalizedComment[]) {
  const evaluated: Array<{comment: NormalizedComment; intent: IntentResult}> = []
  for (const comment of comments) {
    if (comment.text.trim().length < 2) continue
    const intent = await intentEngine.evaluate(comment.text)
    if (intent.matched) evaluated.push({ comment, intent })
  }
  return evaluated
}

async function ingest(account: WatchAccount, evaluated: Array<{comment: NormalizedComment; intent: IntentResult}>, providerName: string) {
  let inserted = 0
  for (const { comment: c, intent } of evaluated) {
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
      intent_label: intent.primaryIntent,
      intent_score: intent.score,
      status: intent.grade === 'A' ? 'high_intent' : 'new',
      detected_country_code: account.country_code || 'CI',
      detected_city: account.city || 'Abidjan',
      market_scope: account.market_scope || 'abidjan_auto',
      geo_confidence: 75,
      metadata: {
        provider: providerName,
        external_comment_id: c.externalId,
        intent_grade: intent.grade,
        matched_rules: intent.matches,
        ...(c.metadata || {}),
      },
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
  const providerName = 'tiktok-live-connector'
  const runId = await startScanRun(account, 'live', providerName)
  const state = await getState(account.id, 'live')
  try {
    const live = await liveProvider.isLive(account.username)
    let itemsSeen = 0
    let candidates = 0
    let inserted = 0
    let cursor = state?.cursor_value || null
    if (live) {
      const comments = await liveProvider.readLiveComments(account.username, cursor)
      itemsSeen = comments.length
      const evaluated = await evaluateComments(comments)
      candidates = evaluated.length
      inserted = await ingest(account, evaluated, providerName)
      cursor = comments.at(-1)?.createdAt || cursor
    }
    await saveState(account, 'live', providerName, { live_status: live, cursor_value: cursor, last_success_at: new Date().toISOString(), last_error: null, last_items_seen: candidates })
    await finishScanRun(runId, { items_seen: itemsSeen, candidates_found: candidates, inserted_count: inserted, error: null })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await saveState(account, 'live', providerName, { last_error: message })
    await finishScanRun(runId, { error: message })
  }
}

async function scanVideos(account: WatchAccount) {
  if (!account.video_comment_monitor || !(await due(account, 'video_comment'))) return
  if (!videoProvider) {
    await saveState(account, 'video_comment', 'not-configured', { last_error: 'video_provider_not_configured' })
    return
  }
  const providerName = videoProvider.name
  const runId = await startScanRun(account, 'video_comment', providerName)
  const state = await getState(account.id, 'video_comment')
  try {
    const videos = await videoProvider.listRecentVideos(account.username, account.watch_tier === 'A' ? 8 : account.watch_tier === 'B' ? 5 : 3)
    let itemsSeen = 0
    let candidates = 0
    let inserted = 0
    let newest = state?.cursor_value || null
    for (const video of videos) {
      const comments = await videoProvider.readVideoComments(account.username, video, state?.cursor_value || null)
      itemsSeen += comments.length
      const evaluated = await evaluateComments(comments)
      candidates += evaluated.length
      inserted += await ingest(account, evaluated, providerName)
      const last = comments.at(-1)?.createdAt
      if (last && (!newest || new Date(last) > new Date(newest))) newest = last
    }
    await saveState(account, 'video_comment', providerName, { cursor_value: newest, last_success_at: new Date().toISOString(), last_error: null, last_items_seen: candidates })
    await finishScanRun(runId, { items_seen: itemsSeen, candidates_found: candidates, inserted_count: inserted, error: null })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await saveState(account, 'video_comment', providerName, { last_error: message })
    await finishScanRun(runId, { error: message })
  }
}

async function cycle() {
  await intentEngine.refresh()
  const accounts = await loadWatchlist()
  for (const account of accounts) await Promise.all([scanLive(account), scanVideos(account)])
  console.log(JSON.stringify({ at: new Date().toISOString(), accounts: accounts.length, videoProvider: Boolean(videoProvider) }))
}

async function main() {
  console.log('GF Auto TikTok Radar worker V0.4 started')
  const shutdown = async () => { await liveProvider.disconnectAll(); process.exit(0) }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  for (;;) {
    try { await cycle() } catch (e) { console.error('cycle_error', e) }
    await new Promise(resolve => setTimeout(resolve, LOOP_MS))
  }
}

void main()
