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
  // The two insights caches were computed from the data just deleted.
  // Best-effort, each on its own: a cache table only exists once schema.sql
  // was applied by hand (supabase/README.md; a missing Hogar one is skipped
  // quietly), and a failed cache delete must not fail the reset after the
  // user's data is gone, nor skip the other cache.
  for (const table of ['ai_household_insights', 'ai_insights']) {
    try {
      await deleteByUser(userId, table, {
        tolerateMissing: table === 'ai_household_insights',
      })
    } catch (error) {
      console.warn('Could not clear cached insights during reset:', error)
    }
  }
}
