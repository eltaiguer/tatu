/**
 * Find the most similar already-categorized merchant for an unknown transaction.
 * Uses token similarity to suggest a category based on known merchants.
 */
import { Category } from '../../models'
import { tokenize, fuzzyTokenSimilarity } from './tokenizer'
import { normalizeMerchantName, type PatternMatch } from './merchant-patterns'

export interface CategorizedMerchant {
  name: string
  category: string
}

/** Minimum similarity to suggest a match */
const MIN_SIMILARITY = 0.5

/** Max confidence for similar-merchant suggestions */
const MAX_CONFIDENCE = 0.6

/**
 * Find the most similar categorized merchant for a given description.
 * Returns the best match above the similarity threshold, or null.
 */
export function findSimilarMerchant(
  description: string,
  categorizedMerchants: CategorizedMerchant[]
): PatternMatch | null {
  const normalized = normalizeMerchantName(description)
  if (!normalized) return null

  const inputTokens = tokenize(normalized)
  if (inputTokens.length === 0) return null

  let bestScore = 0
  let bestCategory: Category = Category.Uncategorized
  let bestMerchant = ''

  for (const merchant of categorizedMerchants) {
    if (
      merchant.category === Category.Uncategorized ||
      merchant.category === 'uncategorized'
    ) {
      continue
    }

    const merchantTokens = tokenize(merchant.name)
    if (merchantTokens.length === 0) continue

    const score = fuzzyTokenSimilarity(inputTokens, merchantTokens)
    if (score > bestScore) {
      bestScore = score
      bestCategory = merchant.category as Category
      bestMerchant = merchant.name
    }
  }

  if (bestScore < MIN_SIMILARITY) return null

  return {
    category: bestCategory,
    confidence: Math.min(bestScore * MAX_CONFIDENCE, MAX_CONFIDENCE),
    matchedPattern: `similar:${bestMerchant}`,
  }
}
