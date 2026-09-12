import { getSupabaseClient, type SupabaseSession } from './client'
import type { InsightsResult } from '../insights/insight-generator'

export interface CachedInsightsRow {
  inputHash: string
  model: string
  insights: InsightsResult
  generatedAt: string
}

interface AiInsightsRow {
  user_id: string
  input_hash: string
  model: string
  insights: InsightsResult
  generated_at: string
}

export async function loadCachedInsights(
  session: SupabaseSession
): Promise<CachedInsightsRow | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('ai_insights')
    .select('*')
    .eq('user_id', session.user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw new Error(error.message)
  }

  const row = data as AiInsightsRow
  return {
    inputHash: row.input_hash,
    model: row.model,
    insights: row.insights,
    generatedAt: row.generated_at,
  }
}

export interface SaveInsightsParams {
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
      input_hash: params.inputHash,
      model: params.model,
      insights: params.insights,
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    throw new Error(error.message)
  }
}
