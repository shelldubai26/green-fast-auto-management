import type { SupabaseClient } from '@supabase/supabase-js'

export type IntentRule = {
  id: string
  intent_type: string
  pattern: string
  match_type: 'contains' | 'regex'
  weight: number
}

export type IntentMatch = {
  intentType: string
  pattern: string
  weight: number
}

export type IntentResult = {
  matched: boolean
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  primaryIntent: string | null
  matches: IntentMatch[]
}

const normalize = (value: string) => value
  .toLocaleLowerCase('fr')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const normalizedPattern = (rule: IntentRule) => normalize(rule.pattern)

export class IntentEngine {
  private rules: IntentRule[] = []
  private loadedAt = 0
  constructor(private supabase: SupabaseClient, private workerToken: string) {}

  async refresh(force = false) {
    if (!force && this.rules.length && Date.now() - this.loadedAt < 5 * 60_000) return
    const { data, error } = await this.supabase.rpc('radar_worker_get_rules', { p_token: this.workerToken })
    if (error) throw error
    this.rules = ((data || []) as IntentRule[]).filter(r => r.intent_type && r.pattern)
    this.loadedAt = Date.now()
  }

  async evaluate(text: string): Promise<IntentResult> {
    await this.refresh()
    const source = normalize(text)
    const matches: IntentMatch[] = []
    for (const rule of this.rules) {
      let hit = false
      if (rule.match_type === 'regex') {
        try { hit = new RegExp(rule.pattern, 'i').test(text) } catch { hit = false }
      } else {
        hit = source.includes(normalizedPattern(rule))
      }
      if (hit) matches.push({ intentType: rule.intent_type, pattern: rule.pattern, weight: rule.weight })
    }

    if (!matches.length) return { matched: false, score: 0, grade: 'D', primaryIntent: null, matches: [] }

    const byIntent = new Map<string, number>()
    for (const m of matches) byIntent.set(m.intentType, Math.max(byIntent.get(m.intentType) || 0, m.weight))

    let score = 10
    for (const weight of byIntent.values()) score += weight
    const distinct = byIntent.size
    if (distinct >= 2) score += 8
    if (distinct >= 3) score += 10
    if (distinct >= 4) score += 12

    const explicitPurchase = byIntent.get('purchase') || 0
    const visit = byIntent.get('visit') || 0
    const contact = byIntent.get('contact') || 0
    const finance = byIntent.get('finance') || 0
    const price = byIntent.get('price') || 0
    const availability = byIntent.get('availability') || 0

    if (explicitPurchase >= 26) score += 12
    if (visit >= 22 && (price || availability || explicitPurchase)) score += 10
    if (contact >= 20 && (price || explicitPurchase || finance)) score += 8
    if (finance >= 18 && price >= 12) score += 8

    score = Math.max(0, Math.min(100, score))
    const grade: IntentResult['grade'] = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 35 ? 'C' : 'D'
    const primaryIntent = [...byIntent.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || null
    return { matched: score >= 25, score, grade, primaryIntent, matches }
  }
}
