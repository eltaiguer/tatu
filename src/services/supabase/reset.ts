import { getSupabaseClient, type SupabaseSession } from './client'

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
  await deleteByUser(session, 'custom_categories')
}
