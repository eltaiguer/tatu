import { getSupabaseClient } from './client'
import { isMissingTable } from './missing-table'

async function deleteByUser(
  userId: string,
  table: string,
  { tolerateMissing = false } = {}
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from(table).delete().eq('user_id', userId)

  if (error) {
    // A table added by hand (supabase/README.md) has no rows to delete yet.
    if (tolerateMissing && isMissingTable(error)) return
    throw new Error(error.message)
  }
}

export async function resetUserSupabaseData(userId: string): Promise<void> {
  await deleteByUser(userId, 'transactions')
  await deleteByUser(userId, 'import_runs')
  await deleteByUser(userId, 'category_overrides')
  await deleteByUser(userId, 'household_rules', { tolerateMissing: true })
  await deleteByUser(userId, 'description_overrides')
  await deleteByUser(userId, 'custom_categories')
  await deleteByUser(userId, 'custom_patterns')
  await deleteByUser(userId, 'user_preferences')
  // Hogar's cache table is added by hand after the code ships (#251): a
  // missing one has nothing to delete, anything else fails the reset.
  await deleteByUser(userId, 'ai_household_insights', { tolerateMissing: true })
  // Cached insights were computed from the data just deleted. Best-effort:
  // the table only exists once schema.sql was applied manually (see
  // supabase/README.md), and a stale cache must not fail the reset.
  try {
    await deleteByUser(userId, 'ai_insights')
  } catch (error) {
    console.warn('Could not clear cached insights during reset:', error)
  }
}
