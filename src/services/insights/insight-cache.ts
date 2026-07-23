import type { SupabaseSession } from '../supabase/client'
import {
  loadCachedInsights as loadCachedInsightsRow,
  saveInsights as saveInsightsRow,
} from '../supabase/ai-insights'
import type { InsightInput } from './insight-data'
import type { InsightsResult } from './insight-generator'

/**
 * Deterministic, non-cryptographic hash of an InsightInput — used only to
 * detect whether the underlying transactions changed since insights were
 * last generated for a period. Not a security boundary.
 */
export function hashInsightInput(input: InsightInput): string {
  const json = JSON.stringify(input)
  let hash = 0x811c9dc5 // FNV-1a 32-bit offset basis
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export interface CachedInsightsLookup {
  result: InsightsResult
  model: string
  generatedAt: string
  isStale: boolean
}

/**
 * Looks up a cached insights row for the input's period. `isStale` is true
 * when the current InsightInput no longer matches the hash of the input
 * that produced the cached result (new imports, edits, re-categorization) —
 * the UI shows a "data changed, regenerate?" banner instead of silently
 * regenerating (see ADR-0001).
 */
export async function getCachedInsights(
  session: SupabaseSession,
  input: InsightInput
): Promise<CachedInsightsLookup | null> {
  const row = await loadCachedInsightsRow(
    session,
    input.periodStart,
    input.periodEnd
  )
  if (!row) return null

  return {
    result: row.insights,
    model: row.model,
    generatedAt: row.generatedAt,
    isStale: row.inputHash !== hashInsightInput(input),
  }
}

export async function saveCachedInsights(
  session: SupabaseSession,
  input: InsightInput,
  result: InsightsResult,
  model: string
): Promise<void> {
  await saveInsightsRow(session, {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    inputHash: hashInsightInput(input),
    model,
    insights: result,
  })
}
