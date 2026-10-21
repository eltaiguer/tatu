import { getSupabaseClient } from './client'

async function deleteByUser(userId: string, table: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from(table).delete().eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function resetUserSupabaseData(userId: string): Promise<void> {
  await deleteByUser(userId, 'transactions')
  await deleteByUser(userId, 'import_runs')
  await deleteByUser(userId, 'category_overrides')
  await deleteByUser(userId, 'description_overrides')
  await deleteByUser(userId, 'custom_categories')
  await deleteByUser(userId, 'custom_patterns')
  await deleteByUser(userId, 'user_preferences')
  // Cached insights were computed from the data just deleted. Best-effort:
  // the table only exists once schema.sql was applied manually (see
  // supabase/README.md), and a stale cache must not fail the reset.
  try {
    await deleteByUser(userId, 'ai_insights')
  } catch (error) {
    console.warn('Could not clear cached insights during reset:', error)
  }
}
