import type { Currency } from '../../models'
import type { InsightInput } from './insight-data'
import { INSIGHTS_MODEL } from '../ai/models'
import { AiError } from '../ai/ai-error'
import {
  createClaudeClient,
  parseModelJson,
  type ClaudeClient,
} from '../ai/claude-client'
import {
  buildInsightSystemPrompt,
  buildInsightUserMessage,
} from './insight-prompt'
import { fold } from '../merchants/merchant-key'

export type InsightType =
  | 'bleeding_money'
  | 'easiest_cut'
  | 'recurring'
  | 'trend'
  | 'anomaly'

export type InsightSeverity = 'low' | 'medium' | 'high'

export interface Insight {
  type: InsightType
  title: string
  narrative: string
  amount?: number
  currency: Currency
  category?: string
  merchant?: string
  severity: InsightSeverity
}

export interface InsightsResult {
  insights: Insight[]
}

// INSIGHTS_MODEL is a stronger model than per-transaction categorization
// (see ADR-0001): this is a single call reasoning over aggregated data, not
// a high-volume per-row classification.

const VALID_TYPES = new Set<InsightType>([
  'bleeding_money',
  'easiest_cut',
  'recurring',
  'trend',
  'anomaly',
])

const VALID_SEVERITIES = new Set<InsightSeverity>(['low', 'medium', 'high'])

// The money amounts of categoryChanges a card may show: an increase's
// current, median and delta; a drop's current, median and delta without its
// minus sign (the prompt says to quote it that way, and the card would show
// "-US$ 50"). Not pctChange (a percentage), and never 0 (a category that
// stopped has nothing to show: the narrative says so).
function categoryChangeAmounts(input: InsightInput): number[] {
  const changes = input.categoryChanges
  if (!changes) return []
  const amounts = changes.increases.flatMap((c) => [
    c.current,
    c.median,
    c.delta,
  ])
  if (changes.decrease) {
    const { current, median, delta } = changes.decrease
    amounts.push(current, median, Math.abs(delta))
  }
  return amounts.filter((amount) => amount !== 0)
}

// Every amount the model may echo, built once per response.
function knownAmounts(input: InsightInput): Set<number> {
  return new Set([
    ...input.categoryTotals.map((c) => c.amount),
    ...input.topMerchants.map((m) => m.amount),
    ...input.recurringCharges.map((r) => r.approxAmount),
    ...categoryChangeAmounts(input),
  ])
}

function isKnownCategory(category: string, input: InsightInput): boolean {
  return input.categoryTotals.some((c) => c.category === category)
}

// How a merchant name is compared with what the model echoes: the merchant
// key's folding (case, accents, "*", spacing), and separators (" · ", " - ",
// " — ") may drift too.
function merchantMatchKey(name: string): string {
  return fold(name.replace(/\s+[·•|\-–—]\s+/g, ' '))
}

// The input's own spelling of the merchant the model named, if exactly one
// input merchant matches it.
function knownMerchant(
  merchant: string,
  input: InsightInput
): string | undefined {
  const wanted = merchantMatchKey(merchant)
  const names = new Set([
    ...input.topMerchants.map((m) => m.merchant),
    ...input.recurringCharges.map((r) => r.merchant),
  ])
  const matches = [...names].filter((name) => merchantMatchKey(name) === wanted)
  return matches.length === 1 ? matches[0] : undefined
}

function sanitizeInsight(
  raw: unknown,
  input: InsightInput,
  amounts: Set<number>
): Insight | null {
  if (typeof raw !== 'object' || raw === null) return null
  const item = raw as Record<string, unknown>

  if (typeof item.title !== 'string' || !item.title.trim()) return null
  if (typeof item.narrative !== 'string' || !item.narrative.trim()) return null

  const rawType = typeof item.type === 'string' ? item.type : ''
  if (!VALID_TYPES.has(rawType as InsightType)) return null
  const type = rawType as InsightType

  const rawSeverity = typeof item.severity === 'string' ? item.severity : ''
  const severity = VALID_SEVERITIES.has(rawSeverity as InsightSeverity)
    ? (rawSeverity as InsightSeverity)
    : 'medium'

  const insight: Insight = {
    type,
    title: item.title.trim(),
    narrative: item.narrative.trim(),
    currency: input.homeCurrency,
    severity,
  }

  if (typeof item.amount === 'number' && amounts.has(item.amount)) {
    insight.amount = item.amount
  }
  if (
    typeof item.category === 'string' &&
    isKnownCategory(item.category, input)
  ) {
    insight.category = item.category
  }
  const merchant =
    typeof item.merchant === 'string'
      ? knownMerchant(item.merchant, input)
      : undefined
  if (merchant !== undefined) insight.merchant = merchant

  return insight
}

export function parseInsightsResponse(
  text: string,
  input: InsightInput
): InsightsResult {
  const parsed = parseModelJson(text, 'object')
  if (typeof parsed !== 'object' || parsed === null) {
    throw new AiError(
      'bad_response',
      'respuesta inesperada del modelo (no es un objeto)'
    )
  }
  const { insights: rawList } = parsed as { insights?: unknown }

  const rawInsights = Array.isArray(rawList) ? rawList : []
  const amounts = knownAmounts(input)
  const insights = rawInsights
    .map((item) => sanitizeInsight(item, input, amounts))
    .filter((i): i is Insight => i !== null)

  return { insights }
}

/** `client` is the real Claude client unless a test hands in a fake. */
export async function generateInsights(
  input: InsightInput,
  apiKey: string,
  client: ClaudeClient = createClaudeClient(apiKey)
): Promise<InsightsResult> {
  // Opus 5.5 thinks before answering and the thinking is billed against
  // max_tokens, so the cap leaves room for both; medium effort is the
  // model's default, set explicitly so a default change cannot move it.
  const text = await client.complete({
    model: INSIGHTS_MODEL,
    system: buildInsightSystemPrompt(input.scope),
    user: buildInsightUserMessage(input),
    maxTokens: 16000,
    effort: 'medium',
  })

  return parseInsightsResponse(text, input)
}
