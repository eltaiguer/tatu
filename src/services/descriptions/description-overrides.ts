import { buildDescriptionOverrideKey } from './normalization'

const STORAGE_KEY = 'tatu:descriptionOverrides'

export interface DescriptionOverride {
  descriptionOriginal?: string
  friendlyDescription: string
  category?: string
  updatedAt: string
}

export type DescriptionOverrides = Record<string, DescriptionOverride>

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function loadOverrides(): DescriptionOverrides {
  if (!hasLocalStorage()) {
    return {}
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as DescriptionOverrides
    return parsed || {}
  } catch {
    return {}
  }
}

function saveOverrides(overrides: DescriptionOverrides): void {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function getDescriptionOverride(
  description: string
): DescriptionOverride | null {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return null
  }

  const overrides = loadOverrides()
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

  const overrides = loadOverrides()
  overrides[descriptionKey] = {
    descriptionOriginal: input.description,
    friendlyDescription: input.friendlyDescription,
    category: input.category,
    updatedAt: new Date().toISOString(),
  }
  saveOverrides(overrides)
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
    // local override remains as fallback
  }
}

export function clearDescriptionOverride(description: string): void {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return
  }

  const overrides = loadOverrides()
  if (overrides[descriptionKey]) {
    delete overrides[descriptionKey]
    saveOverrides(overrides)
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
    // local fallback already applied
  }
}

export function listDescriptionOverrides(): DescriptionOverrides {
  return loadOverrides()
}

export function clearAllDescriptionOverrides(): void {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}

export function replaceDescriptionOverrides(
  overrides: DescriptionOverrides
): void {
  saveOverrides(overrides)
}
