import { getSupabaseClient, type SupabaseSession } from './client'
import type { InsightsResult } from '../insights/insight-generator'
import { UserFacingError } from '../../utils/user-error'

// The ai_insights table exists only once schema.sql is applied by hand
// (supabase/README.md): Postgres says 42P01, PostgREST's schema cache
// PGRST205. That is setup, not a bug, and the raw text is English.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

function throwInsightsError(error: { code?: string; message: string }): never {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
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
  session: SupabaseSession
): Promise<CachedInsightsRow | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('ai_insights')
    .select('*')
    .eq('user_id', session.user.id)
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

  if (error) throwInsightsError(error)
}
