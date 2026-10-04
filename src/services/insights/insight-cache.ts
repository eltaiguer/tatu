import type { SupabaseSession } from '../supabase/client'
import {
  loadCachedInsights as loadCachedInsightsRow,
  saveInsights as saveInsightsRow,
} from '../supabase/ai-insights'
import { INSIGHTS_MODEL } from '../ai/models'
import type { InsightInput } from './insight-data'
import type { InsightsResult } from './insight-generator'
import { INSIGHT_PROMPT_VERSION } from './insight-prompt'

/** What produced a cached result besides the input: prompt + model. */
export interface InsightGenerator {
  promptVersion: number
  model: string
}

/**
 * Deterministic, non-cryptographic hash of an InsightInput together with the
 * prompt version and model that turn it into insights — used only to detect
 * whether a cached result is out of date (the underlying transactions
 * changed, or the prompt or INSIGHTS_MODEL changed since it was generated).
 * Not a security boundary.
 */
export function hashInsightInput(
  input: InsightInput,
  {
    promptVersion = INSIGHT_PROMPT_VERSION,
    model = INSIGHTS_MODEL,
  }: Partial<InsightGenerator> = {}
): string {
  const json = JSON.stringify({ promptVersion, model, input })
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
 * Looks up the cached insights row for this user (one row per user — see
 * ADR-0002). `isStale` is true when the current InsightInput no longer
 * matches the hash of the input that produced the cached result (new
 * imports, edits, re-categorization), or the prompt version / insights model
 * changed since it was generated — the UI shows a "data changed,
 * regenerate?" banner instead of silently regenerating.
 */
export async function getCachedInsights(
  session: SupabaseSession,
  input: InsightInput
): Promise<CachedInsightsLookup | null> {
  const row = await loadCachedInsightsRow(session)
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
    inputHash: hashInsightInput(input, { model }),
    model,
    insights: result,
  })
}
