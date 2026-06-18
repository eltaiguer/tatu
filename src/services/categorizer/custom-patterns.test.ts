import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Category } from '../../models'
import {
  addCustomPattern,
  clearAllCustomPatterns,
  listCustomPatterns,
  matchCustomPattern,
  removeCustomPattern,
  replaceCustomPatterns,
  testPattern,
} from './custom-patterns'

const { getActiveSupabaseSessionMock, upsertCustomPatternMock, deleteCustomPatternMock } =
  vi.hoisted(() => ({
    getActiveSupabaseSessionMock: vi.fn(),
    upsertCustomPatternMock: vi.fn(),
    deleteCustomPatternMock: vi.fn(),
  }))

vi.mock('../supabase/runtime', () => ({
  getActiveSupabaseSession: getActiveSupabaseSessionMock,
}))

vi.mock('../supabase/custom-patterns', () => ({
  upsertCustomPattern: upsertCustomPatternMock,
  deleteCustomPattern: deleteCustomPatternMock,
}))

describe('Custom Patterns', () => {
  beforeEach(() => {
    clearAllCustomPatterns()
    vi.clearAllMocks()
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

  describe('Supabase sync', () => {
    it('syncs add when session exists', async () => {
      getActiveSupabaseSessionMock.mockReturnValue({ user: { id: 'user-1' } })
      upsertCustomPatternMock.mockResolvedValue(undefined)

      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      await vi.waitFor(() =>
        expect(upsertCustomPatternMock).toHaveBeenCalledTimes(1)
      )
    })

    it('syncs remove when session exists', async () => {
      getActiveSupabaseSessionMock.mockReturnValue({ user: { id: 'user-1' } })
      deleteCustomPatternMock.mockResolvedValue(undefined)

      const added = addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })
      await vi.waitFor(() =>
        expect(upsertCustomPatternMock).toHaveBeenCalledTimes(1)
      )

      removeCustomPattern(added.id)
      await vi.waitFor(() =>
        expect(deleteCustomPatternMock).toHaveBeenCalledWith(
          expect.anything(),
          added.id
        )
      )
    })

    it('does not sync when no session', async () => {
      getActiveSupabaseSessionMock.mockReturnValue(null)

      addCustomPattern({
        pattern: 'farmacia',
        matchType: 'contains',
        category: Category.Healthcare,
      })

      await new Promise((r) => setTimeout(r, 50))
      expect(upsertCustomPatternMock).not.toHaveBeenCalled()
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
