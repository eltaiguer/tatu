import { getSupabaseClient } from './client'
import { isMissingTable } from './missing-table'
import { UserFacingError } from '../../utils/user-error'

interface HouseholdRuleRow {
  user_id: string
  merchant_normalized: string
  merchant_original: string | null
  is_household: boolean
  created_at: string
  updated_at: string
}

export interface HouseholdRuleRecord {
  merchantNormalized: string
  merchantOriginal?: string
  isHousehold: boolean
  createdAt: string
  updatedAt: string
}

function rowToRecord(row: HouseholdRuleRow): HouseholdRuleRecord {
  return {
    merchantNormalized: row.merchant_normalized,
    merchantOriginal: row.merchant_original ?? undefined,
    isHousehold: row.is_household,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// A rule cannot be saved before schema.sql creates the table (by hand,
// supabase/README.md): say so, and no retry will help.
function throwWriteError(error: { code?: string; message: string }): never {
  if (isMissingTable(error)) {
    throw new UserFacingError(
      'Falta crear la tabla de reglas del hogar en la base de datos (ver supabase/README.md).'
    )
  }
  throw new Error(error.message)
}

export async function listHouseholdRules(
  userId: string
): Promise<HouseholdRuleRecord[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('household_rules')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    // Until schema.sql is applied by hand there are no rules, and the app
    // must still load.
    if (isMissingTable(error)) return []
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowToRecord(row as HouseholdRuleRow))
}

export async function upsertHouseholdRule(
  userId: string,
  input: {
    merchantNormalized: string
    merchantOriginal?: string
    isHousehold: boolean
  }
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('household_rules').upsert(
    {
      user_id: userId,
      merchant_normalized: input.merchantNormalized,
      merchant_original: input.merchantOriginal ?? null,
      is_household: input.isHousehold,
    },
    { onConflict: 'user_id,merchant_normalized' }
  )

  if (error) {
    throwWriteError(error)
  }
}

export async function deleteHouseholdRule(
  userId: string,
  merchantNormalized: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('household_rules')
    .delete()
    .eq('user_id', userId)
    .eq('merchant_normalized', merchantNormalized)

  if (error) {
    throwWriteError(error)
  }
}
