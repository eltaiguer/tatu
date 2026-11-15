import { getSupabaseClient } from './client'

interface CustomCategoryRow {
  user_id: string
  id: string
  label: string
  color: string
  icon: string | null
  is_ignored: boolean | null
  is_household?: boolean | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface CustomCategoryRecord {
  id: string
  label: string
  color: string
  icon?: string
  /**
   * undefined when the column is NULL. The schema has it NOT NULL DEFAULT
   * false, so this is defensive rather than reachable today — but a null must
   * not read as an explicit false, which would override a built-in's default.
   */
  isIgnored?: boolean
  /**
   * The user's household default for this category (ADR-0005). undefined when
   * the column is NULL or missing: use the seeded default.
   */
  isHousehold?: boolean
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
    isIgnored: row.is_ignored ?? undefined,
    isHousehold:
      typeof row.is_household === 'boolean' ? row.is_household : undefined,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCustomCategories(
  userId: string
): Promise<CustomCategoryRecord[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('custom_categories')
    .select('*')
    .eq('user_id', userId)
    .is('is_archived', false)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowToRecord(row as CustomCategoryRow))
}

export async function upsertCustomCategory(
  userId: string,
  category: {
    id: string
    label: string
    color: string
    icon?: string
    isIgnored?: boolean
    /** Absent = column untouched; null = clear (back to the seeded default). */
    isHousehold?: boolean | null
    isArchived?: boolean
  }
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('custom_categories').upsert(
    {
      user_id: userId,
      id: category.id,
      label: category.label,
      color: category.color,
      icon: category.icon ?? null,
      // custom_categories.is_ignored is NOT NULL DEFAULT false — writing null
      // is rejected by Postgres, so an unset flag persists as false.
      is_ignored: category.isIgnored ?? false,
      // Written only when given (#251): an upsert that omits a column leaves
      // it as it was, so editing a label never resets the household default,
      // and a plain edit of a single-row category keeps working on a database
      // that has not got the column yet (creating a category writes it, so the
      // SQL must be applied). is_household is nullable: null clears it.
      ...(category.isHousehold !== undefined
        ? { is_household: category.isHousehold }
        : {}),
      is_archived: category.isArchived ?? false,
    },
    { onConflict: 'user_id,id' }
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function archiveCustomCategory(
  userId: string,
  categoryId: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('custom_categories')
    .update({ is_archived: true })
    .eq('user_id', userId)
    .eq('id', categoryId)

  if (error) {
    throw new Error(error.message)
  }
}
