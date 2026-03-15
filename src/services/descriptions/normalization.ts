const DIACRITICS_REGEX = /[\u0300-\u036f]/g

/**
 * Normalize a transaction description into a stable matching key.
 * Removes variable tokens like dates, times, references and long IDs.
 */
export function normalizeDescriptionForOverride(description: string): string {
  return description
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b(?:aut|auth|ref|nro|nro\.|nº|id)\s*[:#-]?\s*[a-z0-9-]+\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildDescriptionOverrideKey(
  description: string
): string | null {
  const normalized = normalizeDescriptionForOverride(description)
  if (normalized) {
    return normalized
  }

  const rawFallback = description.toLowerCase().trim().replace(/\s+/g, ' ')
  if (!rawFallback) {
    return null
  }

  return `raw:${rawFallback}`
}
