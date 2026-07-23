import { getSupabaseClient, type SupabaseSession } from './client'
import type { InsightsResult } from '../insights/insight-generator'

export interface CachedInsightsRow {
  periodStart: string
  periodEnd: string
  inputHash: string
  model: string
  insights: InsightsResult
  generatedAt: string
}

interface AiInsightsRow {
  user_id: string
  period_start: string
  period_end: string
  input_hash: string
  model: string
  insights: InsightsResult
  generated_at: string
}

export async function loadCachedInsights(
  session: SupabaseSession,
  periodStart: string,
  periodEnd: string
): Promise<CachedInsightsRow | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('ai_insights')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw new Error(error.message)
  }

  const row = data as AiInsightsRow
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    inputHash: row.input_hash,
    model: row.model,
    insights: row.insights,
    generatedAt: row.generated_at,
  }
}

export interface SaveInsightsParams {
  periodStart: string
  periodEnd: string
  inputHash: string
  model: string
  insights: InsightsResult
}

export async function saveInsights(
  session: SupabaseSession,
  params: SaveInsightsParams
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('ai_insights').upsert(
    {
      user_id: session.user.id,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      input_hash: params.inputHash,
      model: params.model,
      insights: params.insights,
    },
    { onConflict: 'user_id,period_start,period_end' }
  )

  if (error) {
    throw new Error(error.message)
  }
}
