import { buildDescriptionOverrideKey } from './normalization'
import {
  deleteDescriptionOverride,
  upsertDescriptionOverride,
} from '../supabase/description-overrides'
import { getActiveSupabaseSession } from '../supabase/runtime'

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

// Puts a local entry back as it was when the remote write fails, so the
// screen never shows a name the server didn't get.
function restoreOverride(
  key: string,
  previous: DescriptionOverride | undefined
): void {
  if (previous) overrides[key] = previous
  else delete overrides[key]
}

export async function setDescriptionOverrideWithSync(input: {
  description: string
  friendlyDescription: string
  category?: string
}): Promise<void> {
  const descriptionKey = buildDescriptionOverrideKey(input.description)
  const previous = descriptionKey ? overrides[descriptionKey] : undefined
  setDescriptionOverride(input)
  if (!descriptionKey) {
    return
  }

  // Remote failures propagate (after rolling back the local entry) so the
  // caller can tell the user the change wasn't saved.
  try {
    const session = getActiveSupabaseSession()
    if (session) {
      await upsertDescriptionOverride(session, {
        descriptionNormalized: descriptionKey,
        descriptionOriginal: input.description,
        friendlyDescription: input.friendlyDescription,
        category: input.category,
      })
    }
  } catch (error) {
    restoreOverride(descriptionKey, previous)
    throw error
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
  const previous = descriptionKey ? overrides[descriptionKey] : undefined
  clearDescriptionOverride(description)
  if (!descriptionKey) {
    return
  }

  try {
    const session = getActiveSupabaseSession()
    if (session) {
      await deleteDescriptionOverride(session, descriptionKey)
    }
  } catch (error) {
    restoreOverride(descriptionKey, previous)
    throw error
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
