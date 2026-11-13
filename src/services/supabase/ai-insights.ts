import { getSupabaseClient } from './client'
import type { InsightsResult } from '../insights/insight-generator'
import { UserFacingError } from '../../utils/user-error'
import { isMissingTable } from './missing-table'

/**
 * Which cache row: Todo's (`ai_insights`) or the household's
 * (`ai_household_insights`, #251). One row per user in each.
 */
export type InsightsMode = 'todo' | 'hogar'

const TABLES: Record<InsightsMode, string> = {
  todo: 'ai_insights',
  hogar: 'ai_household_insights',
}

const MISSING_TABLE_MESSAGES: Record<InsightsMode, string> = {
  todo: 'Falta crear la tabla de insights en la base de datos (ver supabase/README.md).',
  hogar:
    'Falta crear la tabla de insights del hogar en la base de datos (ver supabase/README.md).',
}

function throwInsightsError(
  error: { code?: string; message: string },
  mode: InsightsMode
): never {
  if (isMissingTable(error)) {
    throw new UserFacingError(MISSING_TABLE_MESSAGES[mode])
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
  userId: string,
  mode: InsightsMode = 'todo'
): Promise<CachedInsightsRow | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from(TABLES[mode])
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
    // Hogar's table is added by hand after the code ships: until then there
    // is simply no household cache (saving it explains what is missing).
    if (mode === 'hogar' && isMissingTable(error)) {
      return null
    }
    throwInsightsError(error, mode)
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
  params: SaveInsightsParams,
  mode: InsightsMode = 'todo'
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from(TABLES[mode]).upsert(
    {
      user_id: userId,
      input_hash: params.inputHash,
      model: params.model,
      insights: params.insights,
    },
    { onConflict: 'user_id' }
  )

  if (error) throwInsightsError(error, mode)
}
