import { getSupabaseClient } from './client'
import type { InsightsResult } from '../insights/insight-generator'
import { UserFacingError } from '../../utils/user-error'
import { isMissingTable } from './missing-table'

function throwInsightsError(error: { code?: string; message: string }): never {
  if (isMissingTable(error)) {
    throw new UserFacingError(
      'Falta crear la tabla de insights en la base de datos (ver supabase/README.md).'
    )
  }
  throw new Error(error.message)
}

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
  userId: string
): Promise<CachedInsightsRow | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('ai_insights')
    .select('*')
    .eq('user_id', userId)
    // maybeSingle: no cached row is the normal first-run state, not an
    // error (.single() answered it with a 406).
    .maybeSingle()

  if (error) {
    // More than one row (a database still on the old per-period key, see
    // supabase/README.md) is treated as "no usable cache".
    if (error.code === 'PGRST116') {
      return null
    }
    throwInsightsError(error)
  }
  if (!data) {
    return null
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
  userId: string,
  params: SaveInsightsParams
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('ai_insights').upsert(
    {
      user_id: userId,
      input_hash: params.inputHash,
      model: params.model,
      insights: params.insights,
    },
    { onConflict: 'user_id' }
  )

  if (error) throwInsightsError(error)
}
