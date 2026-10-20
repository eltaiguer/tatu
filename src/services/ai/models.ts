// Single source of truth for every Claude model ID the app uses.
// Import from here — never inline a model ID string elsewhere.

// Insight generation always uses a stronger model than per-transaction
// categorization (user_preferences.ai_model, often Haiku) — see ADR-0001.
export const INSIGHTS_MODEL = 'claude-opus-5-5'

// Models the user can pick for transaction categorization (Settings → IA).
export const CATEGORIZATION_MODELS = [
  { label: 'Haiku', id: 'claude-haiku-5-5' },
  { label: 'Sonnet', id: 'claude-sonnet-5-5' },
] as const

export type CategorizationModelId = (typeof CATEGORIZATION_MODELS)[number]['id']

// Used when the user has no stored preference (fresh state or null column).
export const DEFAULT_CATEGORIZATION_MODEL: CategorizationModelId =
  'claude-haiku-5-5'

// Ids a user_preferences row may still hold from an earlier generation, and
// the model that replaces each. Resolved on load so Settings and every call
// see a current id; nothing is rewritten until the user saves a preference.
const LEGACY_CATEGORIZATION_MODELS: Record<string, CategorizationModelId> = {
  'claude-haiku-4-5': 'claude-haiku-5-5',
  'claude-sonnet-4-6': 'claude-sonnet-5-5',
}

export function resolveCategorizationModel(
  stored: string | null | undefined
): CategorizationModelId {
  if (!stored) return DEFAULT_CATEGORIZATION_MODEL
  const current = CATEGORIZATION_MODELS.find((m) => m.id === stored)
  if (current) return current.id
  return LEGACY_CATEGORIZATION_MODELS[stored] ?? DEFAULT_CATEGORIZATION_MODEL
}

// Jev (TypeSafe's decision model) as served by OpenRouter, pinned to a
// release so the eval compares like with like; `~typesafe/jev-latest` moves.
// Used by the [Dev] evaluation panel only (services/ai/jev-classifier.ts).
export const JEV_MODEL = 'typesafe/jev-1.14'
