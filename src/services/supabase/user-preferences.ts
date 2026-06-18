import { getSupabaseClient, type SupabaseSession } from './client'

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  currency: 'USD' | 'UYU'
  fxRate: number
  claudeApiKey: string
  aiEnabled: boolean
  aiModel: string
}

interface UserPreferencesRow {
  user_id: string
  theme: string
  currency: string
  fx_rate: number
  claude_api_key: string | null
  ai_enabled: boolean
  ai_model: string
  updated_at: string
}

export async function loadUserPreferences(
  session: SupabaseSession
): Promise<UserPreferences | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('user_preferences')
    .select('*')
    .eq('user_id', session.user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw new Error(error.message)
  }

  const row = data as UserPreferencesRow
  return {
    theme: (row.theme as 'light' | 'dark' | 'auto') ?? 'auto',
    currency: (row.currency as 'USD' | 'UYU') ?? 'USD',
    fxRate: row.fx_rate ?? 40.5,
    claudeApiKey: row.claude_api_key ?? '',
    aiEnabled: row.ai_enabled ?? false,
    aiModel: row.ai_model ?? 'claude-haiku-4-5',
  }
}

export async function saveUserPreferences(
  session: SupabaseSession,
  prefs: UserPreferences
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('user_preferences').upsert(
    {
      user_id: session.user.id,
      theme: prefs.theme,
      currency: prefs.currency,
      fx_rate: prefs.fxRate,
      claude_api_key: prefs.claudeApiKey || null,
      ai_enabled: prefs.aiEnabled,
      ai_model: prefs.aiModel,
    },
    { onConflict: 'user_id' }
  )

  if (error) {
    throw new Error(error.message)
  }
}
