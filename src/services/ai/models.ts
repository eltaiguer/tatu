// Single source of truth for every Claude model ID the app uses.
// Import from here — never inline a model ID string elsewhere.

// Insight generation always uses a stronger model than per-transaction
// categorization (user_preferences.ai_model, often Haiku) — see ADR-0001.
export const INSIGHTS_MODEL = 'claude-opus-4-8'

// Models the user can pick for transaction categorization (Settings → IA).
export const CATEGORIZATION_MODELS = [
  { label: 'Haiku', id: 'claude-haiku-4-5' },
  { label: 'Sonnet', id: 'claude-sonnet-4-6' },
] as const

export type CategorizationModelId = (typeof CATEGORIZATION_MODELS)[number]['id']

// Used when the user has no stored preference (fresh state or null column).
export const DEFAULT_CATEGORIZATION_MODEL: CategorizationModelId =
  'claude-haiku-4-5'
