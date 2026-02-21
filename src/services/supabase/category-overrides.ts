import { getSupabaseClient, type SupabaseSession } from './client'

interface CategoryOverrideRow {
  user_id: string
  merchant_normalized: string
  merchant_original: string | null
  category: string
  created_at: string
  updated_at: string
}

export interface CategoryOverrideRecord {
  merchantNormalized: string
  merchantOriginal?: string
  category: string
  createdAt: string
  updatedAt: string
}

function rowToRecord(row: CategoryOverrideRow): CategoryOverrideRecord {
  return {
    merchantNormalized: row.merchant_normalized,
    merchantOriginal: row.merchant_original ?? undefined,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCategoryOverrides(
  session: SupabaseSession
): Promise<CategoryOverrideRecord[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('category_overrides')
    .select('*')
    .eq('user_id', session.user.id)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowToRecord(row as CategoryOverrideRow))
}

export async function upsertCategoryOverride(
  session: SupabaseSession,
  input: {
    merchantNormalized: string
    merchantOriginal?: string
    category: string
  }
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('category_overrides').upsert(
    {
      user_id: session.user.id,
      merchant_normalized: input.merchantNormalized,
      merchant_original: input.merchantOriginal ?? null,
      category: input.category,
    },
    { onConflict: 'user_id,merchant_normalized' }
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteCategoryOverride(
  session: SupabaseSession,
  merchantNormalized: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('category_overrides')
    .delete()
    .eq('user_id', session.user.id)
    .eq('merchant_normalized', merchantNormalized)

  if (error) {
    throw new Error(error.message)
  }
}
