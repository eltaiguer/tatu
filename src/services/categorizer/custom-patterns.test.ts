import { describe, it, expect, beforeEach } from 'vitest'
import { Category } from '../../models'
import {
  addCustomPattern,
  addCustomPatternWithSync,
  clearAllCustomPatterns,
  listCustomPatterns,
  matchCustomPattern,
  removeCustomPattern,
  removeCustomPatternWithSync,
  replaceCustomPatterns,
  testPattern,
} from './custom-patterns'

import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../repository/in-memory-repository'
import { workspaceStore } from '../../stores/workspace-state'

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

    it('should hydrate patterns from remote via replaceCustomPatterns', () => {
      replaceCustomPatterns([
        {
          id: 'cp_remote_1',
          pattern: 'supermercado',
          matchType: 'contains',
          category: Category.Groceries,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ])

      const patterns = listCustomPatterns()
      expect(patterns).toHaveLength(1)
      expect(patterns[0].id).toBe('cp_remote_1')
    })
  })

  describe('saved through the repository it is given (#119)', () => {
    let repo: InMemoryRepository

    beforeEach(() => {
      repo = createInMemoryRepository()
      workspaceStore.setState({ userId: repo.userId, status: 'ready' })
    })

    it('saves an added rule and deletes a removed one on the server', async () => {
      const added = await addCustomPatternWithSync(repo, {
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      expect(repo.customPatterns.get(added.id)?.pattern).toBe('farmacia')

      await removeCustomPatternWithSync(repo, added.id)
      expect(repo.customPatterns.size).toBe(0)
      expect(listCustomPatterns()).toEqual([])
    })

    it("refuses to save a rule for a user whose workspace isn't loaded", async () => {
      workspaceStore.setState({ userId: null, status: 'idle' })

      await expect(
        addCustomPatternWithSync(repo, {
          pattern: 'farmacia',
          matchType: 'contains',
          category: Category.Healthcare,
        })
      ).rejects.toThrow(/sesión/)

      expect(repo.customPatterns.size).toBe(0)
      expect(listCustomPatterns()).toEqual([])
    })

    it('drops a new rule whose remote save failed', async () => {
      repo.failOn('upsertCustomPattern', { error: new Error('timeout') })

      await expect(
        addCustomPatternWithSync(repo, {
          pattern: 'farmacia',
          matchType: 'contains',
          category: Category.Healthcare,
        })
      ).rejects.toThrow('timeout')
      expect(listCustomPatterns()).toEqual([])
    })

    it('puts back a rule whose remote delete failed, in place', async () => {
      const a = addCustomPattern({
        pattern: 'a',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      const b = addCustomPattern({
        pattern: 'b',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      repo.failOn('deleteCustomPattern', { error: new Error('timeout') })

      await expect(removeCustomPatternWithSync(repo, a.id)).rejects.toThrow(
        'timeout'
      )
      expect(listCustomPatterns().map((p) => p.id)).toEqual([a.id, b.id])
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

    it('returns description when pattern has one', () => {
      addCustomPattern({
        pattern: 'farmacia del sol',
        matchType: 'contains',
        category: Category.Healthcare,
        description: 'Farmacia Del Sol',
      })

      const result = matchCustomPattern('COMPRA FARMACIA DEL SOL 01/12')
      expect(result).not.toBeNull()
      expect(result!.description).toBe('Farmacia Del Sol')
    })

    it('returns undefined description when pattern has none', () => {
      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      const result = matchCustomPattern('Farmacia del Sol')
      expect(result).not.toBeNull()
      expect(result!.description).toBeUndefined()
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

  describe('testPattern', () => {
    it('matches contains type', () => {
      const pattern = addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      expect(testPattern('FARMACIA DEL SOL', pattern)).toBe(true)
      expect(testPattern('Devoto Supermercado', pattern)).toBe(false)
    })

    it('matches starts_with type', () => {
      const pattern = addCustomPattern({
        pattern: 'taxi',
        matchType: 'starts_with',
        category: Category.Transport,
      })
      expect(testPattern('Taxi Express', pattern)).toBe(true)
      expect(testPattern('My Taxi', pattern)).toBe(false)
    })

    it('matches exact type', () => {
      const pattern = addCustomPattern({
        pattern: 'spotify',
        matchType: 'exact',
        category: Category.Entertainment,
      })
      expect(testPattern('Spotify', pattern)).toBe(true)
      expect(testPattern('Spotify Premium', pattern)).toBe(false)
    })

    it('returns false for empty description', () => {
      const pattern = addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      expect(testPattern('', pattern)).toBe(false)
    })
  })
})
