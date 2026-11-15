import { getSupabaseClient } from './client'
import type { InsightsResult } from '../insights/insight-generator'
import type { InsightsMode } from '../insights/insight-data'
import { UserFacingError } from '../../utils/user-error'
import { isMissingTable } from './missing-table'

// Which cache row: Todo's (`ai_insights`) or the household's
// (`ai_household_insights`, #251). One row per user in each. Hogar's table is
// added by hand after the code ships, so loading it tolerates its absence.
const CACHES: Record<
  InsightsMode,
  { table: string; missingMessage: string; missingReadsAsNoCache: boolean }
> = {
  todo: {
    table: 'ai_insights',
    missingMessage:
      'Falta crear la tabla de insights en la base de datos (ver supabase/README.md).',
    missingReadsAsNoCache: false,
  },
  hogar: {
    table: 'ai_household_insights',
    missingMessage:
      'Falta crear la tabla de insights del hogar en la base de datos (ver supabase/README.md).',
    missingReadsAsNoCache: true,
  },
}

function throwInsightsError(
  error: { code?: string; message: string },
  mode: InsightsMode
): never {
  if (isMissingTable(error)) {
    throw new UserFacingError(CACHES[mode].missingMessage)
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
    .from(CACHES[mode].table)
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
    if (CACHES[mode].missingReadsAsNoCache && isMissingTable(error)) {
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
  const { error } = await client.from(CACHES[mode].table).upsert(
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
