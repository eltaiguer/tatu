/**
 * Category hints based on transaction amount and currency.
 * These are low-confidence suggestions used as a last resort
 * when no other categorization method matches.
 */
import { Category, type Currency, type TransactionType } from '../../models'
import type { PatternMatch } from './merchant-patterns'

/**
 * Suggest a category based on amount, currency, and transaction type.
 * Only applies to debits (expenses). Returns low-confidence hints.
 */
export function categorizeByAmount(
  amount: number,
  currency: Currency,
  type: TransactionType
): PatternMatch | null {
  // Only suggest for debits (expenses)
  if (type !== 'debit') return null
  if (amount <= 0) return null

  if (currency === 'UYU') {
    return categorizeByUYU(amount)
  }

  if (currency === 'USD') {
    return categorizeByUSD(amount)
  }

  return null
}

function categorizeByUYU(amount: number): PatternMatch | null {
  // Small amounts: likely restaurants, cafes, quick meals
  if (amount < 500) {
    return {
      category: Category.Restaurants,
      confidence: 0.2,
      matchedPattern: 'amount:uyu<500',
    }
  }

  // Medium amounts: likely groceries
  if (amount <= 3000) {
    return {
      category: Category.Groceries,
      confidence: 0.15,
      matchedPattern: 'amount:uyu500-3000',
    }
  }

  // Large amounts: likely shopping
  if (amount > 15000) {
    return {
      category: Category.Shopping,
      confidence: 0.15,
      matchedPattern: 'amount:uyu>15000',
    }
  }

  return null
}

function categorizeByUSD(amount: number): PatternMatch | null {
  // Round USD amounts typical of software subscriptions
  if (isRoundAmount(amount) && amount <= 100) {
    return {
      category: Category.Software,
      confidence: 0.25,
      matchedPattern: 'amount:usd-round',
    }
  }

  // Small USD amounts
  if (amount < 15) {
    return {
      category: Category.Software,
      confidence: 0.2,
      matchedPattern: 'amount:usd<15',
    }
  }

  // Large USD amounts
  if (amount > 400) {
    return {
      category: Category.Shopping,
      confidence: 0.15,
      matchedPattern: 'amount:usd>400',
    }
  }

  return null
}

/**
 * Check if an amount is "round" — typical of subscription pricing.
 * e.g., 10.00, 19.99, 20.00, 49.99
 */
function isRoundAmount(amount: number): boolean {
  const cents = Math.round(amount * 100) % 100
  return cents === 0 || cents === 99
}
