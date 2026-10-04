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

export function clearDescriptionOverride(description: string): void {
  const descriptionKey = buildDescriptionOverrideKey(description)
  if (!descriptionKey) {
    return
  }

  if (overrides[descriptionKey]) {
    delete overrides[descriptionKey]
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
