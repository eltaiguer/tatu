import {
  buildDescriptionOverrideKey,
  legacyDescriptionOverrideKey,
} from './normalization'

export interface DescriptionOverride {
  descriptionOriginal?: string
  friendlyDescription: string
  category?: string
  updatedAt: string
}

export type DescriptionOverrides = Record<string, DescriptionOverride>

// Replaced, never mutated, on every write: a UserRules snapshot holding the
// previous object keeps seeing exactly the rules it was read with.
let overrides: Readonly<DescriptionOverrides> = {}

/** The override in `from` that covers a row with this description. */
export function findDescriptionOverride(
  from: Readonly<DescriptionOverrides>,
  description: string
): DescriptionOverride | null {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return null
  }

  const current = from[descriptionKey]
  if (current) return current
  // Stored before the code-keyword fix (normalization.ts): read, never written.
  const legacyKey = legacyDescriptionOverrideKey(description)
  return (legacyKey && from[legacyKey]) || null
}

export function getDescriptionOverride(
  description: string
): DescriptionOverride | null {
  return findDescriptionOverride(overrides, description)
}

export function setDescriptionOverride(input: {
  description: string
  friendlyDescription: string
  category?: string
}): void {
  const descriptionKey = buildDescriptionOverrideKey(input.description)
  if (!descriptionKey) {
    return
  }

  overrides = {
    ...overrides,
    [descriptionKey]: {
      descriptionOriginal: input.description,
      friendlyDescription: input.friendlyDescription,
      category: input.category,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function clearDescriptionOverride(description: string): void {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return
  }

  if (overrides[descriptionKey]) {
    const next = { ...overrides }
    delete next[descriptionKey]
    overrides = next
  }
}

export function listDescriptionOverrides(): Readonly<DescriptionOverrides> {
  return overrides
}

export function clearAllDescriptionOverrides(): void {
  overrides = {}
}

export function replaceDescriptionOverrides(
  nextOverrides: Readonly<DescriptionOverrides>
): void {
  overrides = { ...nextOverrides }
}
