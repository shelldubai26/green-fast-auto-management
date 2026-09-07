import { createClient } from '@supabase/supabase-js'
import { SocQTikTokVideoProvider } from './provider-socq.js'

type Suggestion = {
  id: string
  username: string
  geo_score: number | null
  auto_relevance_score: number | null
  purchase_signal_count: number | null
  suggested_priority: number | null
}

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || ''
const RADAR_WORKER_TOKEN = process.env.RADAR_WORKER_TOKEN || ''
const SOCQ_API_KEY = process.env.SOCQ_API_KEY || ''
const VALIDATION_LOOP_MS = Number(process.env.RADAR_DISCOVERY_LOOP_MS || 15 * 60_000)
const CREDIT_COOLDOWN_MS = Number(process.env.RADAR_SOCQ_CREDIT_COOLDOWN_MS || 6 * 60 * 60_000)
const VALIDATION_BATCH = Math.max(1, Math.min(10, Number(process.env.RADAR_VALIDATION_BATCH || 5)))

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const provider = SOCQ_API_KEY ? new SocQTikTokVideoProvider(SOCQ_API_KEY) : null
let creditBlockedUntil = 0

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data as T
}

function scoreSuggestion(s: Suggestion, recentVideos: number) {
  const geo = Math.max(0, Math.min(100, Number(s.geo_score || 0)))
  const auto = Math.max(0, Math.min(100, Number(s.auto_relevance_score || 0)))
  const purchase = Math.min(100, Math.max(0, Number(s.purchase_signal_count || 0)) * 10)
  const activity = Math.min(100, recentVideos * 15)
  return Math.round(geo * 0.25 + auto * 0.35 + purchase * 0.2 + activity * 0.2)
}

function isCreditError(message: string) {
  return /socq_402|insufficient credits/i.test(message)
}

async function validateOne(s: Suggestion) {
  if (!provider) return 'skipped' as const
  try {
    const videos = await provider.listRecentVideos(s.username, 6)
    const count = videos.length
    const score = scoreSuggestion(s, count)
    const valid = count > 0 && score >= 45
    await rpc('radar_worker_save_suggestion_validation', {
      p_token: RADAR_WORKER_TOKEN,
      p_id: s.id,
      p_validation_status: valid ? 'valid' : 'invalid',
      p_account_exists: count > 0,
      p_recent_video_count: count,
      p_provider_name: provider.name,
      p_provider_error: null,
      p_validation_score: score,
      p_validation_notes: {
        gate: 'v0.5.8',
        criteria: 'recent_public_video_and_score',
        threshold: 45,
        suggested_priority: s.suggested_priority || 0,
      },
    })
    console.log(JSON.stringify({ event: 'candidate_validation', username: s.username, videos: count, score, valid, version: '0.5.8' }))
    return 'ok' as const
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isCreditError(message)) {
      creditBlockedUntil = Date.now() + CREDIT_COOLDOWN_MS
      console.error('candidate_validation_credit_blocked', JSON.stringify({ username: s.username, cooldown_ms: CREDIT_COOLDOWN_MS, retry_after: new Date(creditBlockedUntil).toISOString(), version: '0.5.8' }))
      return 'credit_blocked' as const
    }
    await rpc('radar_worker_save_suggestion_validation', {
      p_token: RADAR_WORKER_TOKEN,
      p_id: s.id,
      p_validation_status: 'provider_error',
      p_account_exists: null,
      p_recent_video_count: 0,
      p_provider_name: provider.name,
      p_provider_error: message,
      p_validation_score: 0,
      p_validation_notes: { gate: 'v0.5.8' },
    })
    console.error('candidate_validation_error', s.username, message)
    return 'error' as const
  }
}

async function validationCycle() {
  if (!provider || !RADAR_WORKER_TOKEN) return
  if (Date.now() < creditBlockedUntil) {
    console.log(JSON.stringify({ event: 'candidate_validation_paused', reason: 'socq_credit_circuit_open', retry_after: new Date(creditBlockedUntil).toISOString(), version: '0.5.8' }))
    return
  }
  const suggestions = await rpc<Suggestion[]>('radar_worker_get_suggestions', {
    p_token: RADAR_WORKER_TOKEN,
    p_limit: VALIDATION_BATCH,
  })
  let attempted = 0
  for (const suggestion of suggestions || []) {
    attempted++
    const result = await validateOne(suggestion)
    if (result === 'credit_blocked') break
  }
  console.log(JSON.stringify({ event: 'candidate_validation_cycle', suggestions: suggestions?.length || 0, attempted, provider: provider.name, batch: VALIDATION_BATCH, credit_circuit_open: Date.now() < creditBlockedUntil, version: '0.5.8' }))
}

export function startCandidateValidation() {
  if (!provider) {
    console.log(JSON.stringify({ event: 'candidate_validation_disabled', reason: 'SOCQ_API_KEY_missing', version: '0.5.8' }))
    return
  }
  void validationCycle().catch(error => console.error('candidate_validation_cycle_error', error))
  setInterval(() => void validationCycle().catch(error => console.error('candidate_validation_cycle_error', error)), VALIDATION_LOOP_MS)
}
