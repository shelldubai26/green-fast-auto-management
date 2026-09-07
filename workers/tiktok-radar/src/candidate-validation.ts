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

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const provider = SOCQ_API_KEY ? new SocQTikTokVideoProvider(SOCQ_API_KEY) : null

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

async function validateOne(s: Suggestion) {
  if (!provider) return
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
        gate: 'v0.5.5',
        criteria: 'recent_public_video_and_score',
        threshold: 45,
        suggested_priority: s.suggested_priority || 0,
      },
    })
    console.log(JSON.stringify({ event: 'candidate_validation', username: s.username, videos: count, score, valid, version: '0.5.5' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await rpc('radar_worker_save_suggestion_validation', {
      p_token: RADAR_WORKER_TOKEN,
      p_id: s.id,
      p_validation_status: 'provider_error',
      p_account_exists: null,
      p_recent_video_count: 0,
      p_provider_name: provider.name,
      p_provider_error: message,
      p_validation_score: 0,
      p_validation_notes: { gate: 'v0.5.5' },
    })
    console.error('candidate_validation_error', s.username, message)
  }
}

async function validationCycle() {
  if (!provider || !RADAR_WORKER_TOKEN) return
  const suggestions = await rpc<Suggestion[]>('radar_worker_get_suggestions', {
    p_token: RADAR_WORKER_TOKEN,
    p_limit: 10,
  })
  for (const suggestion of suggestions || []) await validateOne(suggestion)
  console.log(JSON.stringify({ event: 'candidate_validation_cycle', suggestions: suggestions?.length || 0, provider: provider.name, version: '0.5.5' }))
}

export function startCandidateValidation() {
  if (!provider) {
    console.log(JSON.stringify({ event: 'candidate_validation_disabled', reason: 'SOCQ_API_KEY_missing', version: '0.5.5' }))
    return
  }
  void validationCycle().catch(error => console.error('candidate_validation_cycle_error', error))
  setInterval(() => void validationCycle().catch(error => console.error('candidate_validation_cycle_error', error)), VALIDATION_LOOP_MS)
}
