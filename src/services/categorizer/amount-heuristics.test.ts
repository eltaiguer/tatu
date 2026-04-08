import { describe, it, expect } from 'vitest'
import { Category } from '../../models'
import { categorizeByAmount } from './amount-heuristics'

describe('Amount Heuristics', () => {
  describe('UYU transactions', () => {
    it('should suggest Restaurants for small UYU debits', () => {
      const result = categorizeByAmount(350, 'UYU', 'debit')
      expect(result?.category).toBe(Category.Restaurants)
      expect(result?.confidence).toBeLessThanOrEqual(0.3)
    })

    it('should suggest Groceries for medium UYU debits', () => {
      const result = categorizeByAmount(1500, 'UYU', 'debit')
      expect(result?.category).toBe(Category.Groceries)
    })

    it('should suggest Shopping for large UYU debits', () => {
      const result = categorizeByAmount(20000, 'UYU', 'debit')
      expect(result?.category).toBe(Category.Shopping)
    })

    it('should return null for mid-range UYU amounts', () => {
      const result = categorizeByAmount(8000, 'UYU', 'debit')
      expect(result).toBeNull()
    })
  })

  describe('USD transactions', () => {
    it('should suggest Software for round USD amounts', () => {
      const result = categorizeByAmount(20, 'USD', 'debit')
      expect(result?.category).toBe(Category.Software)
    })

    it('should suggest Software for .99 amounts', () => {
      const result = categorizeByAmount(9.99, 'USD', 'debit')
      expect(result?.category).toBe(Category.Software)
    })

    it('should suggest Software for small USD amounts', () => {
      const result = categorizeByAmount(7.5, 'USD', 'debit')
      expect(result?.category).toBe(Category.Software)
    })

    it('should suggest Shopping for large USD amounts', () => {
      const result = categorizeByAmount(500, 'USD', 'debit')
      expect(result?.category).toBe(Category.Shopping)
    })
  })

  describe('edge cases', () => {
    it('should return null for credits', () => {
      const result = categorizeByAmount(1000, 'UYU', 'credit')
      expect(result).toBeNull()
    })

    it('should return null for zero amount', () => {
      const result = categorizeByAmount(0, 'UYU', 'debit')
      expect(result).toBeNull()
    })

    it('should return null for negative amount', () => {
      const result = categorizeByAmount(-100, 'UYU', 'debit')
      expect(result).toBeNull()
    })

    it('should always have low confidence', () => {
      const results = [
        categorizeByAmount(200, 'UYU', 'debit'),
        categorizeByAmount(1500, 'UYU', 'debit'),
        categorizeByAmount(20000, 'UYU', 'debit'),
        categorizeByAmount(20, 'USD', 'debit'),
      ]

      for (const result of results) {
        expect(result).not.toBeNull()
        expect(result!.confidence).toBeLessThanOrEqual(0.3)
      }
    })
  })
})
