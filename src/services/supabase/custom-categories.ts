import { getSupabaseClient, type SupabaseSession } from './client'

interface CustomCategoryRow {
  user_id: string
  id: string
  label: string
  color: string
  icon: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CustomCategoryRecord {
  id: string
  label: string
  color: string
  icon?: string
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

function rowToRecord(row: CustomCategoryRow): CustomCategoryRecord {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    icon: row.icon ?? undefined,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCustomCategories(
  session: SupabaseSession
): Promise<CustomCategoryRecord[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('custom_categories')
    .select('*')
    .eq('user_id', session.user.id)
    .is('is_archived', false)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowToRecord(row as CustomCategoryRow))
}

export async function upsertCustomCategory(
  session: SupabaseSession,
  category: {
    id: string
    label: string
    color: string
    icon?: string
    isArchived?: boolean
  }
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('custom_categories').upsert(
    {
      user_id: session.user.id,
      id: category.id,
      label: category.label,
      color: category.color,
      icon: category.icon ?? null,
      is_archived: category.isArchived ?? false,
    },
    { onConflict: 'user_id,id' }
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function archiveCustomCategory(
  session: SupabaseSession,
  categoryId: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('custom_categories')
    .update({ is_archived: true })
    .eq('user_id', session.user.id)
    .eq('id', categoryId)

  if (error) {
    throw new Error(error.message)
  }
}
