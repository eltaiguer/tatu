import { describe, it, expect } from 'vitest'
import { Category } from '../../models'
import {
  analyzeTemporalPatterns,
  getTemporalSuggestion,
  type TemporalTransaction,
} from './temporal-patterns'

function makeDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

function makeMonthlyTxs(
  description: string,
  amount: number,
  count: number
): TemporalTransaction[] {
  return Array.from({ length: count }, (_, i) => ({
    description,
    amount,
    currency: 'UYU',
    date: makeDate(2025, 1 + i, 15), // Jan 15, Feb 15, Mar 15...
  }))
}

function makeWeeklyTxs(
  description: string,
  count: number
): TemporalTransaction[] {
  return Array.from({ length: count }, (_, i) => ({
    description,
    amount: 800 + Math.random() * 400, // varying amounts
    currency: 'UYU',
    date: makeDate(2025, 1, 1 + i * 7), // every 7 days
  }))
}

describe('Temporal Patterns', () => {
  describe('analyzeTemporalPatterns', () => {
    it('should detect monthly recurring transactions', () => {
      const txs = makeMonthlyTxs('UTE Debito', 2500, 4)
      const patterns = analyzeTemporalPatterns(txs)

      const pattern = patterns.get('ute debito')
      expect(pattern).toBeDefined()
      expect(pattern!.frequency).toBe('monthly')
      expect(pattern!.suggestedCategory).toBe(Category.Utilities)
      expect(pattern!.confidence).toBeGreaterThan(0.5)
      expect(pattern!.occurrences).toBe(4)
    })

    it('should detect weekly patterns', () => {
      const txs = makeWeeklyTxs('Devoto Supermercado', 4)
      const patterns = analyzeTemporalPatterns(txs)

      const pattern = patterns.get('devoto supermercado')
      expect(pattern).toBeDefined()
      expect(pattern!.frequency).toBe('weekly')
      expect(pattern!.suggestedCategory).toBe(Category.Groceries)
    })

    it('should not detect patterns with fewer than 3 occurrences', () => {
      const txs = makeMonthlyTxs('Antel Fijo', 1200, 2)
      const patterns = analyzeTemporalPatterns(txs)

      expect(patterns.has('antel fijo')).toBe(false)
    })

    it('should not detect patterns with irregular intervals', () => {
      const txs: TemporalTransaction[] = [
        {
          description: 'Random Shop',
          amount: 1000,
          currency: 'UYU',
          date: makeDate(2025, 1, 1),
        },
        {
          description: 'Random Shop',
          amount: 1000,
          currency: 'UYU',
          date: makeDate(2025, 1, 5),
        },
        {
          description: 'Random Shop',
          amount: 1000,
          currency: 'UYU',
          date: makeDate(2025, 3, 20),
        },
      ]

      const patterns = analyzeTemporalPatterns(txs)
      expect(patterns.has('random shop')).toBe(false)
    })

    it('should not detect monthly patterns with inconsistent amounts', () => {
      const txs: TemporalTransaction[] = [
        {
          description: 'Varied Expense',
          amount: 1000,
          currency: 'UYU',
          date: makeDate(2025, 1, 15),
        },
        {
          description: 'Varied Expense',
          amount: 5000,
          currency: 'UYU',
          date: makeDate(2025, 2, 15),
        },
        {
          description: 'Varied Expense',
          amount: 200,
          currency: 'UYU',
          date: makeDate(2025, 3, 15),
        },
      ]

      const patterns = analyzeTemporalPatterns(txs)
      expect(patterns.has('varied expense')).toBe(false)
    })

    it('should handle empty transaction list', () => {
      const patterns = analyzeTemporalPatterns([])
      expect(patterns.size).toBe(0)
    })
  })

  describe('getTemporalSuggestion', () => {
    it('should return pattern match for known temporal merchant', () => {
      const txs = makeMonthlyTxs('UTE Debito', 2500, 4)
      const patterns = analyzeTemporalPatterns(txs)

      const result = getTemporalSuggestion('UTE Debito', patterns)
      expect(result).not.toBeNull()
      expect(result!.category).toBe(Category.Utilities)
      expect(result!.matchedPattern).toContain('temporal:monthly')
    })

    it('should return null for unknown merchant', () => {
      const txs = makeMonthlyTxs('UTE Debito', 2500, 4)
      const patterns = analyzeTemporalPatterns(txs)

      const result = getTemporalSuggestion('Random Unknown', patterns)
      expect(result).toBeNull()
    })

    it('should return null for empty patterns map', () => {
      const result = getTemporalSuggestion(
        'Something',
        new Map()
      )
      expect(result).toBeNull()
    })
  })
})
