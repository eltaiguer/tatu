/**
 * User-defined custom pattern rules.
 * Allows users to create reusable patterns like
 * "any merchant containing 'farmacia' = Healthcare".
 */
import { normalizeMerchantName, type PatternMatch } from './merchant-patterns'

const STORAGE_KEY = 'tatu:customPatterns'

export type MatchType = 'contains' | 'starts_with' | 'exact'

export interface CustomPattern {
  id: string
  pattern: string
  matchType: MatchType
  category: string
  createdAt: string
}

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  )
}

function loadPatterns(): CustomPattern[] {
  if (!hasLocalStorage()) return []

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    return JSON.parse(raw) as CustomPattern[]
  } catch {
    return []
  }
}

function savePatterns(patterns: CustomPattern[]): void {
  if (!hasLocalStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns))
}

function generateId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function listCustomPatterns(): CustomPattern[] {
  return loadPatterns()
}

export function addCustomPattern(
  input: Omit<CustomPattern, 'id' | 'createdAt'>
): CustomPattern {
  const pattern: CustomPattern = {
    ...input,
    pattern: normalizeMerchantName(input.pattern),
    id: generateId(),
    createdAt: new Date().toISOString(),
  }

  const patterns = loadPatterns()
  patterns.push(pattern)
  savePatterns(patterns)
  return pattern
}

export function removeCustomPattern(id: string): void {
  const patterns = loadPatterns().filter((p) => p.id !== id)
  savePatterns(patterns)
}

export function clearAllCustomPatterns(): void {
  if (!hasLocalStorage()) return
  window.localStorage.removeItem(STORAGE_KEY)
}

/**
 * Match a description against user-defined custom patterns.
 * Returns the first matching pattern with high confidence (0.95).
 */
export function matchCustomPattern(
  description: string
): PatternMatch | null {
  const normalized = normalizeMerchantName(description)
  if (!normalized) return null

  const patterns = loadPatterns()

  for (const custom of patterns) {
    const normalizedPattern = normalizeMerchantName(custom.pattern)
    if (!normalizedPattern) continue

    let matches = false

    switch (custom.matchType) {
      case 'contains':
        matches = normalized.includes(normalizedPattern)
        break
      case 'starts_with':
        matches = normalized.startsWith(normalizedPattern)
        break
      case 'exact':
        matches = normalized === normalizedPattern
        break
    }

    if (matches) {
      return {
        category: custom.category as PatternMatch['category'],
        confidence: 0.95,
        matchedPattern: `custom:${custom.pattern}(${custom.matchType})`,
      }
    }
  }

  return null
}
