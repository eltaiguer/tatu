const DIACRITICS_REGEX = /[\u0300-\u036f]/g

// "AUT 123456", "REF-ABC", "Nro. 55": a code keyword and the code after it.
// The keyword needs its own boundary, or "autoservicio" and "ideal" lose a
// word ("AUTOSERVICIO DISCO" collapsed to "disco" before, so unrelated
// merchants shared a key).
const CODE_KEYWORD_REGEX =
  /\b(?:aut|auth|ref|nro|id)\b\.?\s*[:#-]?\s*[a-z0-9-]+\b|nº\s*[:#-]?\s*[a-z0-9-]+\b/g
// The pre-fix pattern, kept only to read keys stored under it.
const LEGACY_CODE_KEYWORD_REGEX =
  /\b(?:aut|auth|ref|nro|nro\.|nº|id)\s*[:#-]?\s*[a-z0-9-]+\b/g

function normalizeWith(description: string, codeKeyword: RegExp): string {
  return description
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(codeKeyword, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize a transaction description into a stable matching key.
 * Removes variable tokens like dates, times, references and long IDs.
 */
export function normalizeDescriptionForOverride(description: string): string {
  return normalizeWith(description, CODE_KEYWORD_REGEX)
}

/**
 * The key an override was stored under before the code-keyword fix, when it
 * differs from the current one; null otherwise. Read-only fallback.
 */
export function legacyDescriptionOverrideKey(
  description: string
): string | null {
  const legacy = normalizeWith(description, LEGACY_CODE_KEYWORD_REGEX)
  if (!legacy || legacy === normalizeDescriptionForOverride(description)) {
    return null
  }
  return legacy
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
