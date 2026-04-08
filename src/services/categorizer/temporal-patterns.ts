/**
 * Detect recurring temporal patterns in transaction history.
 * Monthly recurring transactions suggest utilities/subscriptions.
 * Weekly patterns suggest groceries. One-time large amounts suggest shopping.
 */
import { Category } from '../../models'
import { normalizeMerchantName, type PatternMatch } from './merchant-patterns'

export interface TemporalTransaction {
  description: string
  amount: number
  currency: string
  date: Date
}

export type Frequency = 'monthly' | 'weekly' | 'one-time' | 'irregular'

export interface TemporalPattern {
  frequency: Frequency
  averageAmount: number
  currency: string
  suggestedCategory: Category
  confidence: number
  occurrences: number
}

/** Minimum occurrences to detect a pattern */
const MIN_MONTHLY = 3
const MIN_WEEKLY = 3

/** Tolerance for amount matching (±10%) */
const AMOUNT_TOLERANCE = 0.1

/** Day interval tolerances */
const MONTHLY_MIN_DAYS = 25
const MONTHLY_MAX_DAYS = 35
const WEEKLY_MIN_DAYS = 5
const WEEKLY_MAX_DAYS = 9

/**
 * Analyze a set of transactions to detect temporal patterns.
 * Groups by normalized description and analyzes date intervals.
 */
export function analyzeTemporalPatterns(
  transactions: TemporalTransaction[]
): Map<string, TemporalPattern> {
  const patterns = new Map<string, TemporalPattern>()

  // Group by normalized description
  const groups = new Map<string, TemporalTransaction[]>()
  for (const tx of transactions) {
    const key = normalizeMerchantName(tx.description)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }

  for (const [key, txs] of groups) {
    if (txs.length < MIN_WEEKLY) continue

    // Sort by date ascending
    const sorted = [...txs].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    )

    // Check if amounts are consistent (within tolerance)
    const avgAmount =
      sorted.reduce((sum, tx) => sum + tx.amount, 0) / sorted.length
    const amountsConsistent = sorted.every(
      (tx) => Math.abs(tx.amount - avgAmount) / avgAmount <= AMOUNT_TOLERANCE
    )

    // Compute intervals between consecutive transactions
    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const days =
        (sorted[i].date.getTime() - sorted[i - 1].date.getTime()) /
        (1000 * 60 * 60 * 24)
      intervals.push(days)
    }

    if (intervals.length === 0) continue

    const avgInterval =
      intervals.reduce((s, d) => s + d, 0) / intervals.length

    const pattern = detectFrequency(
      avgInterval,
      intervals,
      amountsConsistent,
      sorted.length,
      avgAmount,
      sorted[0].currency
    )

    if (pattern) {
      patterns.set(key, pattern)
    }
  }

  return patterns
}

function detectFrequency(
  avgInterval: number,
  intervals: number[],
  amountsConsistent: boolean,
  count: number,
  avgAmount: number,
  currency: string
): TemporalPattern | null {
  // Check monthly: ~30 days between transactions, consistent amounts
  if (
    count >= MIN_MONTHLY &&
    amountsConsistent &&
    avgInterval >= MONTHLY_MIN_DAYS &&
    avgInterval <= MONTHLY_MAX_DAYS &&
    intervals.every(
      (d) => d >= MONTHLY_MIN_DAYS && d <= MONTHLY_MAX_DAYS
    )
  ) {
    return {
      frequency: 'monthly',
      averageAmount: avgAmount,
      currency,
      suggestedCategory: Category.Utilities,
      confidence: 0.65,
      occurrences: count,
    }
  }

  // Check weekly: ~7 days between transactions
  if (
    count >= MIN_WEEKLY &&
    avgInterval >= WEEKLY_MIN_DAYS &&
    avgInterval <= WEEKLY_MAX_DAYS &&
    intervals.every((d) => d >= WEEKLY_MIN_DAYS && d <= WEEKLY_MAX_DAYS)
  ) {
    return {
      frequency: 'weekly',
      averageAmount: avgAmount,
      currency,
      suggestedCategory: Category.Groceries,
      confidence: 0.4,
      occurrences: count,
    }
  }

  return null
}

/**
 * Get a temporal pattern suggestion for a specific description.
 */
export function getTemporalSuggestion(
  description: string,
  patterns: Map<string, TemporalPattern>
): PatternMatch | null {
  const key = normalizeMerchantName(description)
  if (!key) return null

  const pattern = patterns.get(key)
  if (!pattern) return null

  return {
    category: pattern.suggestedCategory,
    confidence: pattern.confidence,
    matchedPattern: `temporal:${pattern.frequency}(${pattern.occurrences}x)`,
  }
}
