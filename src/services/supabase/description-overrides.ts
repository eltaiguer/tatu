import { getSupabaseClient, type SupabaseSession } from './client'

interface DescriptionOverrideRow {
  user_id: string
  description_normalized: string
  description_original: string | null
  friendly_description: string
  category: string | null
  created_at: string
  updated_at: string
}

export interface DescriptionOverrideRecord {
  descriptionNormalized: string
  descriptionOriginal?: string
  friendlyDescription: string
  category?: string
  createdAt: string
  updatedAt: string
}

function rowToRecord(row: DescriptionOverrideRow): DescriptionOverrideRecord {
  return {
    descriptionNormalized: row.description_normalized,
    descriptionOriginal: row.description_original ?? undefined,
    friendlyDescription: row.friendly_description,
    category: row.category ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listDescriptionOverrides(
  session: SupabaseSession
): Promise<DescriptionOverrideRecord[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('description_overrides')
    .select('*')
    .eq('user_id', session.user.id)

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowToRecord(row as DescriptionOverrideRow))
}

export async function upsertDescriptionOverride(
  session: SupabaseSession,
  input: {
    descriptionNormalized: string
    descriptionOriginal?: string
    friendlyDescription: string
    category?: string
  }
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('description_overrides').upsert(
    {
      user_id: session.user.id,
      description_normalized: input.descriptionNormalized,
      description_original: input.descriptionOriginal ?? null,
      friendly_description: input.friendlyDescription,
      category: input.category ?? null,
    },
    { onConflict: 'user_id,description_normalized' }
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteDescriptionOverride(
  session: SupabaseSession,
  descriptionNormalized: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('description_overrides')
    .delete()
    .eq('user_id', session.user.id)
    .eq('description_normalized', descriptionNormalized)

  if (error) {
    throw new Error(error.message)
  }
}

