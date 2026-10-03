import { UserFacingError } from '../../utils/user-error'
import { normalizeMerchantName, type PatternMatch } from './merchant-patterns'

export type MatchType = 'contains' | 'starts_with' | 'exact'

export interface CustomPattern {
  id: string
  pattern: string
  matchType: MatchType
  category: string
  description?: string
  createdAt: string
}

let patterns: CustomPattern[] = []

function generateId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function replaceCustomPatterns(nextPatterns: CustomPattern[]): void {
  patterns = [...nextPatterns]
}

export function listCustomPatterns(): CustomPattern[] {
  return patterns
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
  patterns = [...patterns, pattern]
  return pattern
}

// The *WithSync functions apply a change locally, push it, and on failure
// undo exactly that change before rethrowing, so the UI never shows a rule
// the server doesn't have (or hides one it still has).
async function requireSession() {
  const { getActiveSupabaseSession } = await import('../supabase/runtime')
  const session = getActiveSupabaseSession()
  if (!session) {
    throw new UserFacingError(
      'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
    )
  }
  return session
}

export async function addCustomPatternWithSync(
  input: Omit<CustomPattern, 'id' | 'createdAt'>
): Promise<CustomPattern> {
  const pattern = addCustomPattern(input)
  try {
    const session = await requireSession()
    const { upsertCustomPattern } = await import('../supabase/custom-patterns')
    await upsertCustomPattern(session, pattern)
  } catch (error) {
    removeCustomPattern(pattern.id)
    throw error
  }
  return pattern
}

export function removeCustomPattern(id: string): void {
  patterns = patterns.filter((p) => p.id !== id)
}

export async function removeCustomPatternWithSync(id: string): Promise<void> {
  const index = patterns.findIndex((p) => p.id === id)
  const previous = patterns[index]
  removeCustomPattern(id)
  try {
    const session = await requireSession()
    const { deleteCustomPattern } = await import('../supabase/custom-patterns')
    await deleteCustomPattern(session, id)
  } catch (error) {
    if (previous && !patterns.some((p) => p.id === id)) {
      patterns = [
        ...patterns.slice(0, index),
        previous,
        ...patterns.slice(index),
      ]
    }
    throw error
  }
}

export function clearAllCustomPatterns(): void {
  patterns = []
}

export function testPattern(
  description: string,
  pattern: CustomPattern
): boolean {
  const normalized = normalizeMerchantName(description)
  if (!normalized) return false

  const normalizedPattern = normalizeMerchantName(pattern.pattern)
  if (!normalizedPattern) return false

  switch (pattern.matchType) {
    case 'contains':
      return normalized.includes(normalizedPattern)
    case 'starts_with':
      return normalized.startsWith(normalizedPattern)
    case 'exact':
      return normalized === normalizedPattern
  }
}

export function matchCustomPattern(description: string): PatternMatch | null {
  const normalized = normalizeMerchantName(description)
  if (!normalized) return null

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
        description: custom.description,
      }
    }
  }

  return null
}
