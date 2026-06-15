import { buildDescriptionOverrideKey } from './normalization'

export interface DescriptionOverride {
  descriptionOriginal?: string
  friendlyDescription: string
  category?: string
  updatedAt: string
}

export type DescriptionOverrides = Record<string, DescriptionOverride>

let overrides: DescriptionOverrides = {}

export function getDescriptionOverride(
  description: string
): DescriptionOverride | null {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return null
  }

  return overrides[descriptionKey] ?? null
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

  overrides[descriptionKey] = {
    descriptionOriginal: input.description,
    friendlyDescription: input.friendlyDescription,
    category: input.category,
    updatedAt: new Date().toISOString(),
  }
}

export async function setDescriptionOverrideWithSync(input: {
  description: string
  friendlyDescription: string
  category?: string
}): Promise<void> {
  setDescriptionOverride(input)
  const descriptionKey = buildDescriptionOverrideKey(input.description)
  if (!descriptionKey) {
    return
  }

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { upsertDescriptionOverride } = await import(
        '../supabase/description-overrides'
      )
      await upsertDescriptionOverride(session, {
        descriptionNormalized: descriptionKey,
        descriptionOriginal: input.description,
        friendlyDescription: input.friendlyDescription,
        category: input.category,
      })
    }
  } catch {
    // in-memory override remains
  }
}

export function clearDescriptionOverride(description: string): void {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return
  }

  if (overrides[descriptionKey]) {
    delete overrides[descriptionKey]
  }
}

export async function clearDescriptionOverrideWithSync(
  description: string
): Promise<void> {
  const descriptionKey = buildDescriptionOverrideKey(description)
  clearDescriptionOverride(description)
  if (!descriptionKey) {
    return
  }

  try {
    const { getActiveSupabaseSession } = await import('../supabase/runtime')
    const session = getActiveSupabaseSession()
    if (session) {
      const { deleteDescriptionOverride } = await import(
        '../supabase/description-overrides'
      )
      await deleteDescriptionOverride(session, descriptionKey)
    }
  } catch {
    // in-memory state already updated
  }
}

export function listDescriptionOverrides(): DescriptionOverrides {
  return overrides
}

export function clearAllDescriptionOverrides(): void {
  overrides = {}
}

export function replaceDescriptionOverrides(
  nextOverrides: DescriptionOverrides
): void {
  overrides = { ...nextOverrides }
}
