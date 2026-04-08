import { describe, it, expect, beforeEach } from 'vitest'
import { Category } from '../../models'
import {
  addCustomPattern,
  clearAllCustomPatterns,
  listCustomPatterns,
  matchCustomPattern,
  removeCustomPattern,
} from './custom-patterns'

describe('Custom Patterns', () => {
  beforeEach(() => {
    clearAllCustomPatterns()
  })

  describe('CRUD', () => {
    it('should add and list patterns', () => {
      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      const patterns = listCustomPatterns()
      expect(patterns).toHaveLength(1)
      expect(patterns[0].pattern).toBe('farmacia')
      expect(patterns[0].category).toBe(Category.Healthcare)
      expect(patterns[0].id).toBeTruthy()
      expect(patterns[0].createdAt).toBeTruthy()
    })

    it('should remove a pattern by id', () => {
      const added = addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      removeCustomPattern(added.id)
      expect(listCustomPatterns()).toHaveLength(0)
    })

    it('should clear all patterns', () => {
      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      addCustomPattern({
        pattern: 'taxi',
        matchType: 'contains',
        category: Category.Transport,
      })

      clearAllCustomPatterns()
      expect(listCustomPatterns()).toHaveLength(0)
    })

    it('should normalize pattern text', () => {
      addCustomPattern({
        pattern: '  FARMACIA  ',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      expect(listCustomPatterns()[0].pattern).toBe('farmacia')
    })
  })

  describe('matchCustomPattern', () => {
    it('should match with contains type', () => {
      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      const result = matchCustomPattern('Farmacia del Sol SA')
      expect(result).not.toBeNull()
      expect(result!.category).toBe(Category.Healthcare)
      expect(result!.confidence).toBe(0.95)
    })

    it('should match with starts_with type', () => {
      addCustomPattern({
        pattern: 'taxi',
        matchType: 'starts_with',
        category: Category.Transport,
      })

      expect(matchCustomPattern('Taxi Express')).not.toBeNull()
      expect(matchCustomPattern('My Taxi')).toBeNull()
    })

    it('should match with exact type', () => {
      addCustomPattern({
        pattern: 'spotify',
        matchType: 'exact',
        category: Category.Entertainment,
      })

      expect(matchCustomPattern('Spotify')).not.toBeNull()
      expect(matchCustomPattern('Spotify Premium')).toBeNull()
    })

    it('should return null when no patterns match', () => {
      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      expect(matchCustomPattern('Devoto Supermercado')).toBeNull()
    })

    it('should return null for empty description', () => {
      expect(matchCustomPattern('')).toBeNull()
    })

    it('should stop matching after pattern is removed', () => {
      const added = addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      expect(matchCustomPattern('Farmacia Sol')).not.toBeNull()

      removeCustomPattern(added.id)
      expect(matchCustomPattern('Farmacia Sol')).toBeNull()
    })
  })
})
