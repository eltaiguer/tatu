import { getSupabaseClient } from './client'
import type { CustomPattern } from '../categorizer/custom-patterns'

interface CustomPatternRow {
  user_id: string
  id: string
  pattern: string
  match_type: string
  category: string
  description: string | null
  created_at: string
}

function rowToPattern(row: CustomPatternRow): CustomPattern {
  return {
    id: row.id,
    pattern: row.pattern,
    matchType: row.match_type as CustomPattern['matchType'],
    category: row.category,
    description: row.description ?? undefined,
    createdAt: row.created_at,
  }
}

export async function listCustomPatterns(
  userId: string
): Promise<CustomPattern[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('custom_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => rowToPattern(row as CustomPatternRow))
}

export async function upsertCustomPattern(
  userId: string,
  pattern: CustomPattern
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('custom_patterns').upsert(
    {
      user_id: userId,
      id: pattern.id,
      pattern: pattern.pattern,
      match_type: pattern.matchType,
      category: pattern.category,
      description: pattern.description ?? null,
      created_at: pattern.createdAt,
    },
    { onConflict: 'user_id,id' }
  )

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteCustomPattern(
  userId: string,
  id: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('custom_patterns')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteAllCustomPatterns(userId: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('custom_patterns')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}
