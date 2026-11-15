import type { Repository } from '../repository/repository'
import { INSIGHTS_MODEL } from '../ai/models'
import {
  insightModeOf,
  type InsightInput,
  type InsightsMode,
} from './insight-data'
import type { InsightsResult } from './insight-generator'
import {
  HOUSEHOLD_INSIGHT_PROMPT_VERSION,
  INSIGHT_PROMPT_VERSION,
} from './insight-prompt'

/** What produced a cached result besides the input: prompt + model. */
export interface InsightGenerator {
  /** Hogar's is `base.household`: its prompt is Todo's plus a paragraph. */
  promptVersion: number | string
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
    promptVersion = insightModeOf(input) === 'hogar'
      ? `${INSIGHT_PROMPT_VERSION}.${HOUSEHOLD_INSIGHT_PROMPT_VERSION}`
      : INSIGHT_PROMPT_VERSION,
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
  /** The hash of the input that produced `result` (what staleness compares). */
  inputHash: string
}

/**
 * The cached row of `mode` (one row per user and mode — ADR-0002, ADR-0005).
 * Whether it is stale is `inputHash !== hashInsightInput(currentInput)`: the
 * hash covers the input, the prompt version and the model, so new imports,
 * edits, re-categorization, a prompt or a model change all flip it, and the UI
 * shows a "data changed, regenerate?" banner instead of regenerating.
 */
export async function loadCachedLookup(
  repository: Repository,
  mode: InsightsMode
): Promise<CachedInsightsLookup | null> {
  const row = await repository.loadInsights(mode)
  if (!row) return null
  return {
    result: row.insights,
    model: row.model,
    generatedAt: row.generatedAt,
    inputHash: row.inputHash,
  }
}

export async function saveCachedInsights(
  repository: Repository,
  input: InsightInput,
  result: InsightsResult,
  model: string
): Promise<void> {
  await repository.saveInsights(
    {
      inputHash: hashInsightInput(input, { model }),
      model,
      insights: result,
    },
    insightModeOf(input)
  )
}
