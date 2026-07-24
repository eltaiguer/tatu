import Anthropic from '@anthropic-ai/sdk'
import type { Currency } from '../../models'
import type { InsightInput } from './insight-data'
import { buildInsightSystemPrompt, buildInsightUserMessage } from './insight-prompt'

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

// Insight generation always uses a stronger model than per-transaction
// categorization (user_preferences.ai_model, often Haiku) — see ADR-0001.
// This is a single call per period reasoning over an entire period's
// aggregated data, not a high-volume per-row classification.
const INSIGHTS_MODEL = 'claude-opus-4-8'

const VALID_TYPES = new Set<InsightType>([
  'bleeding_money',
  'easiest_cut',
  'recurring',
  'trend',
  'anomaly',
])

const VALID_SEVERITIES = new Set<InsightSeverity>(['low', 'medium', 'high'])

function isKnownAmount(amount: number, input: InsightInput): boolean {
  return (
    input.categoryTotals.some((c) => c.amount === amount) ||
    input.topMerchants.some((m) => m.amount === amount) ||
    input.recurringCharges.some((r) => r.approxAmount === amount)
  )
}

function isKnownCategory(category: string, input: InsightInput): boolean {
  return input.categoryTotals.some((c) => c.category === category)
}

function isKnownMerchant(merchant: string, input: InsightInput): boolean {
  return (
    input.topMerchants.some((m) => m.merchant === merchant) ||
    input.recurringCharges.some((r) => r.merchant === merchant)
  )
}

// Every numeric/category/merchant field is verified against the InsightInput
// that was actually sent — an insight referencing a number, category, or
// merchant not present in the input is dropped rather than trusted (same
// discipline as validateCategory() in transaction-ai.ts).
function sanitizeInsight(raw: unknown, input: InsightInput): Insight | null {
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

  if (typeof item.amount === 'number' && isKnownAmount(item.amount, input)) {
    insight.amount = item.amount
  }
  if (
    typeof item.category === 'string' &&
    isKnownCategory(item.category, input)
  ) {
    insight.category = item.category
  }
  if (
    typeof item.merchant === 'string' &&
    isKnownMerchant(item.merchant, input)
  ) {
    insight.merchant = item.merchant
  }

  return insight
}

export function parseInsightsResponse(
  text: string,
  input: InsightInput
): InsightsResult {
  let parsed: { insights?: unknown[] }
  try {
    const raw = text.trim()
    const jsonText = raw.startsWith('{')
      ? raw
      : (raw.match(/\{[\s\S]*\}/)?.[0] ?? raw)
    parsed = JSON.parse(jsonText) as typeof parsed
  } catch (e) {
    throw new Error(
      `No se pudo parsear la respuesta del modelo: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  const rawInsights = Array.isArray(parsed.insights) ? parsed.insights : []
  const insights = rawInsights
    .map((item) => sanitizeInsight(item, input))
    .filter((i): i is Insight => i !== null)

  return { insights }
}

export async function generateInsights(
  input: InsightInput,
  apiKey: string
): Promise<InsightsResult> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const response = await client.messages.create({
    model: INSIGHTS_MODEL,
    max_tokens: 4096,
    system: buildInsightSystemPrompt(),
    messages: [{ role: 'user', content: buildInsightUserMessage(input) }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error(`Respuesta inesperada del modelo (tipo: ${block.type})`)
  }

  return parseInsightsResponse(block.text, input)
}
