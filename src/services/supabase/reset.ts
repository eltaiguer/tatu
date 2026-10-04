import { getSupabaseClient, type SupabaseSession } from './client'
import { captureError } from '../monitoring/error-reporting'

async function deleteByUser(
  session: SupabaseSession,
  table: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from(table)
    .delete()
    .eq('user_id', session.user.id)

  if (error) {
    throw new Error(error.message)
  }
}

export async function resetUserSupabaseData(
  session: SupabaseSession
): Promise<void> {
  await deleteByUser(session, 'transactions')
  await deleteByUser(session, 'import_runs')
  await deleteByUser(session, 'category_overrides')
  await deleteByUser(session, 'description_overrides')
  await deleteByUser(session, 'custom_categories')
  await deleteByUser(session, 'custom_patterns')
  await deleteByUser(session, 'user_preferences')
  // Cached insights were computed from the data just deleted. Best-effort:
  // the table only exists once schema.sql was applied manually (see
  // supabase/README.md), and a stale cache must not fail the reset.
  try {
    await deleteByUser(session, 'ai_insights')
  } catch (error) {
    console.warn('Could not clear cached insights during reset:', error)
    captureError(error, 'reset')
  }
}
