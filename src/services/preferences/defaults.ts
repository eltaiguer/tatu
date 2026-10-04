import type { UserPreferences } from '../supabase/user-preferences'
import { DEFAULT_CATEGORIZATION_MODEL } from '../ai/models'

/** What a user without a `user_preferences` row gets. */
export const DEFAULT_PREFERENCES: Readonly<UserPreferences> = Object.freeze({
  theme: 'auto',
  currency: 'USD',
  fxRate: 40.5,
  claudeApiKey: '',
  aiEnabled: false,
  aiModel: DEFAULT_CATEGORIZATION_MODEL,
})
