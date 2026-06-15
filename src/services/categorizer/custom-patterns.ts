import { normalizeMerchantName, type PatternMatch } from './merchant-patterns'

export type MatchType = 'contains' | 'starts_with' | 'exact'

export interface CustomPattern {
  id: string
  pattern: string
  matchType: MatchType
  category: string
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

  void import('../supabase/runtime').then(({ getActiveSupabaseSession }) => {
    const session = getActiveSupabaseSession()
    if (!session) return
    import('../supabase/custom-patterns').then(({ upsertCustomPattern }) => {
      void upsertCustomPattern(session, pattern)
    })
  })

  return pattern
}

export function removeCustomPattern(id: string): void {
  patterns = patterns.filter((p) => p.id !== id)

  void import('../supabase/runtime').then(({ getActiveSupabaseSession }) => {
    const session = getActiveSupabaseSession()
    if (!session) return
    import('../supabase/custom-patterns').then(({ deleteCustomPattern }) => {
      void deleteCustomPattern(session, id)
    })
  })
}

export function clearAllCustomPatterns(): void {
  patterns = []
}

export function matchCustomPattern(
  description: string
): PatternMatch | null {
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
      }
    }
  }

  return null
}
