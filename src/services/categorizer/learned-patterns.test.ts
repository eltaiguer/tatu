import { describe, it, expect, beforeEach } from 'vitest'
import { Category } from '../../models'
import {
  buildLearnedPatterns,
  matchLearnedPattern,
  invalidateLearnedPatternsCache,
} from './learned-patterns'
import {
  clearAllCategoryOverrides,
  setMerchantCategoryOverride,
} from './category-overrides'

describe('Learned Patterns', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
    invalidateLearnedPatternsCache()
  })

  describe('buildLearnedPatterns', () => {
    it('should learn a token appearing in 2+ overrides of same category', () => {
      const overrides = {
        'farmacia central': {
          category: Category.Healthcare,
          merchantName: 'Farmacia Central',
          updatedAt: new Date().toISOString(),
        },
        'farmacia nueva': {
          category: Category.Healthcare,
          merchantName: 'Farmacia Nueva',
          updatedAt: new Date().toISOString(),
        },
      }

      const patterns = buildLearnedPatterns(overrides)
      expect(patterns.get('farmacia')).toBe(Category.Healthcare)
    })

    it('should not learn from a single override', () => {
      const overrides = {
        'farmacia central': {
          category: Category.Healthcare,
          merchantName: 'Farmacia Central',
          updatedAt: new Date().toISOString(),
        },
      }

      const patterns = buildLearnedPatterns(overrides)
      expect(patterns.has('farmacia')).toBe(false)
    })

    it('should not learn ambiguous tokens', () => {
      const overrides = {
        'tienda salud': {
          category: Category.Healthcare,
          merchantName: 'Tienda Salud',
          updatedAt: new Date().toISOString(),
        },
        'tienda ropa': {
          category: Category.Shopping,
          merchantName: 'Tienda Ropa',
          updatedAt: new Date().toISOString(),
        },
      }

      const patterns = buildLearnedPatterns(overrides)
      // "tienda" appears once per category — 50/50, not > 60%
      expect(patterns.has('tienda')).toBe(false)
    })

    it('should learn dominant token even with some noise', () => {
      const overrides = {
        'panaderia juan': {
          category: Category.Groceries,
          merchantName: 'Panaderia Juan',
          updatedAt: new Date().toISOString(),
        },
        'panaderia maria': {
          category: Category.Groceries,
          merchantName: 'Panaderia Maria',
          updatedAt: new Date().toISOString(),
        },
        'panaderia rara': {
          category: Category.Restaurants,
          merchantName: 'Panaderia Rara',
          updatedAt: new Date().toISOString(),
        },
      }

      const patterns = buildLearnedPatterns(overrides)
      // 2/3 = 66.7% > 60%, so it should learn
      expect(patterns.get('panaderia')).toBe(Category.Groceries)
    })
  })

  describe('matchLearnedPattern', () => {
    it('should match using learned patterns from overrides', () => {
      setMerchantCategoryOverride('Farmacia Central', Category.Healthcare)
      setMerchantCategoryOverride('Farmacia Nueva', Category.Healthcare)
      invalidateLearnedPatternsCache()

      const result = matchLearnedPattern('Farmacia del Sol')
      expect(result).not.toBeNull()
      expect(result!.category).toBe(Category.Healthcare)
      expect(result!.confidence).toBeGreaterThan(0)
      expect(result!.confidence).toBeLessThanOrEqual(0.75)
    })

    it('should return null when no learned patterns match', () => {
      setMerchantCategoryOverride('Farmacia Central', Category.Healthcare)
      setMerchantCategoryOverride('Farmacia Nueva', Category.Healthcare)
      invalidateLearnedPatternsCache()

      const result = matchLearnedPattern('Random Unknown Place')
      expect(result).toBeNull()
    })

    it('should return null when no overrides exist', () => {
      const result = matchLearnedPattern('Farmacia del Sol')
      expect(result).toBeNull()
    })

    it('should return null for empty description', () => {
      const result = matchLearnedPattern('')
      expect(result).toBeNull()
    })

    it('should invalidate cache correctly', () => {
      setMerchantCategoryOverride('Farmacia Central', Category.Healthcare)
      setMerchantCategoryOverride('Farmacia Nueva', Category.Healthcare)
      invalidateLearnedPatternsCache()

      expect(matchLearnedPattern('Farmacia X')).not.toBeNull()

      clearAllCategoryOverrides()
      invalidateLearnedPatternsCache()

      expect(matchLearnedPattern('Farmacia X')).toBeNull()
    })
  })
})
