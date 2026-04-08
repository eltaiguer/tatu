/**
 * Learns category patterns from accumulated user overrides.
 *
 * When multiple overrides share the same token for the same category
 * (e.g., "farmacia x" and "farmacia y" both mapped to Healthcare),
 * the token "farmacia" becomes a learned pattern for Healthcare.
 */
import { Category } from '../../models'
import { tokenize } from './tokenizer'
import {
  type CategoryOverrides,
  listMerchantCategoryOverrides,
} from './category-overrides'
import type { PatternMatch } from './merchant-patterns'

/** Minimum number of overrides a token must appear in to become a learned pattern */
const MIN_OCCURRENCES = 2

/** Max confidence for learned patterns (below explicit patterns) */
const MAX_CONFIDENCE = 0.75

/** Cache for learned patterns */
let cachedPatterns: Map<string, Category> | null = null
let cachedHash: string | null = null

function hashOverrides(overrides: CategoryOverrides): string {
  const entries = Object.entries(overrides)
    .map(([k, v]) => `${k}:${v.category}`)
    .sort()
  return entries.join('|')
}

/**
 * Build learned patterns from all category overrides.
 * A token becomes a learned pattern when it appears in MIN_OCCURRENCES+
 * overrides of the same category and is NOT ambiguous (i.e., doesn't
 * appear in overrides of other categories at similar frequency).
 */
export function buildLearnedPatterns(
  overrides: CategoryOverrides
): Map<string, Category> {
  // Count token → category occurrences
  const tokenCategoryCounts = new Map<string, Map<string, number>>()

  for (const [, override] of Object.entries(overrides)) {
    const tokens = tokenize(override.merchantName ?? '')
    for (const token of tokens) {
      if (!tokenCategoryCounts.has(token)) {
        tokenCategoryCounts.set(token, new Map())
      }
      const counts = tokenCategoryCounts.get(token)!
      const count = counts.get(override.category) ?? 0
      counts.set(override.category, count + 1)
    }
  }

  // Extract unambiguous patterns
  const learned = new Map<string, Category>()

  for (const [token, categoryCounts] of tokenCategoryCounts) {
    // Find the dominant category for this token
    let bestCategory = ''
    let bestCount = 0
    let totalCount = 0

    for (const [category, count] of categoryCounts) {
      totalCount += count
      if (count > bestCount) {
        bestCount = count
        bestCategory = category
      }
    }

    // Token must meet minimum occurrences
    if (bestCount < MIN_OCCURRENCES) continue

    // Token must be unambiguous: dominant category has > 60% of occurrences
    if (bestCount / totalCount <= 0.6) continue

    learned.set(token, bestCategory as Category)
  }

  return learned
}

/**
 * Get learned patterns with caching.
 * Cache is invalidated when overrides change.
 */
export function getLearnedPatterns(): Map<string, Category> {
  const overrides = listMerchantCategoryOverrides()
  const hash = hashOverrides(overrides)

  if (cachedPatterns && cachedHash === hash) {
    return cachedPatterns
  }

  cachedPatterns = buildLearnedPatterns(overrides)
  cachedHash = hash
  return cachedPatterns
}

/**
 * Invalidate the learned patterns cache.
 * Call this when overrides are added/removed.
 */
export function invalidateLearnedPatternsCache(): void {
  cachedPatterns = null
  cachedHash = null
}

/**
 * Match a description against learned patterns.
 * Uses token voting: if multiple tokens match, the category with
 * the most matching tokens wins.
 */
export function matchLearnedPattern(
  description: string
): PatternMatch | null {
  const patterns = getLearnedPatterns()
  if (patterns.size === 0) return null

  const tokens = tokenize(description)
  if (tokens.length === 0) return null

  // Vote by category
  const votes = new Map<Category, number>()
  let totalMatches = 0

  for (const token of tokens) {
    const category = patterns.get(token)
    if (category) {
      votes.set(category, (votes.get(category) ?? 0) + 1)
      totalMatches++
    }
  }

  if (totalMatches === 0) return null

  // Find winner
  let bestCategory: Category = Category.Uncategorized
  let bestVotes = 0
  for (const [category, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count
      bestCategory = category
    }
  }

  // Confidence: proportion of input tokens that matched, capped
  const confidence = Math.min(
    (totalMatches / tokens.length) * MAX_CONFIDENCE,
    MAX_CONFIDENCE
  )

  return {
    category: bestCategory,
    confidence,
    matchedPattern: `learned:${[...patterns.entries()].filter(([, c]) => c === bestCategory).map(([t]) => t).join(',')}`,
  }
}
