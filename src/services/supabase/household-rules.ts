import { getSupabaseClient } from './client'

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

export async function listHouseholdRules(
  userId: string
): Promise<HouseholdRuleRecord[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('household_rules')
    .select('*')
    .eq('user_id', userId)

  if (error) {
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
    throw new Error(error.message)
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
    throw new Error(error.message)
  }
}
