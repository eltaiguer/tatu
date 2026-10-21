/**
 * Learns category patterns from accumulated user overrides.
 *
 * When multiple overrides share the same token for the same category
 * (e.g., "farmacia x" and "farmacia y" both mapped to Healthcare),
 * the token "farmacia" becomes a learned pattern for Healthcare.
 */
import { Category } from '../../models'
import { tokenize } from './tokenizer'
import type { CategoryOverrides } from './category-overrides'
import type { PatternMatch } from './merchant-patterns'

/** Minimum number of overrides a token must appear in to become a learned pattern */
const MIN_OCCURRENCES = 2

/** Max confidence for learned patterns (below explicit patterns) */
const MAX_CONFIDENCE = 0.75

/**
 * Learned patterns per overrides object. The merchant-override store
 * replaces its object on every write (copy-on-write), so an object never
 * changes after its patterns are built: the same object — one `UserRules`
 * value, however many rows it categorizes — builds them once.
 */
const learnedByOverrides = new WeakMap<
  CategoryOverrides,
  Map<string, Category>
>()

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

/** The patterns learned from `overrides`, built once per object. */
export function getLearnedPatterns(
  overrides: CategoryOverrides
): Map<string, Category> {
  let learned = learnedByOverrides.get(overrides)
  if (!learned) {
    learned = buildLearnedPatterns(overrides)
    learnedByOverrides.set(overrides, learned)
  }
  return learned
}

/**
 * Match a description against learned patterns.
 * Uses token voting: if multiple tokens match, the category with
 * the most matching tokens wins.
 */
export function matchLearnedPattern(
  description: string,
  overrides: CategoryOverrides
): PatternMatch | null {
  const patterns = getLearnedPatterns(overrides)
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
    matchedPattern: `learned:${[...patterns.entries()]
      .filter(([, c]) => c === bestCategory)
      .map(([t]) => t)
      .join(',')}`,
  }
}
