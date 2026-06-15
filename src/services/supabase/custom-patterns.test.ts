import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  selectMock,
  eqSelectMock,
  orderMock,
  upsertMock,
  deleteMock,
  eqDeleteUserMock,
  eqDeleteIdMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqSelectMock: vi.fn(),
  orderMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteMock: vi.fn(),
  eqDeleteUserMock: vi.fn(),
  eqDeleteIdMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./client', () => ({
  getSupabaseClient: () => ({ from: fromMock }),
}))

const session: SupabaseSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  user: {
    id: 'user-1',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '',
  },
}

const sampleRow = {
  user_id: 'user-1',
  id: 'cp-1',
  pattern: 'devoto',
  match_type: 'contains',
  category: 'groceries',
  created_at: '2026-01-01T00:00:00.000Z',
}

describe('supabase custom-patterns service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    orderMock.mockResolvedValue({ data: [sampleRow], error: null })
    eqSelectMock.mockReturnValue({ order: orderMock })
    selectMock.mockReturnValue({ eq: eqSelectMock })

    upsertMock.mockResolvedValue({ error: null })

    eqDeleteIdMock.mockResolvedValue({ error: null })
    eqDeleteUserMock.mockReturnValue({ eq: eqDeleteIdMock })
    deleteMock.mockReturnValue({ eq: eqDeleteUserMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'custom_patterns') {
        throw new Error(`unexpected table: ${table}`)
      }
      return {
        select: selectMock,
        upsert: upsertMock,
        delete: deleteMock,
      }
    })
  })

  describe('listCustomPatterns', () => {
    it('queries for the current user and orders by created_at', async () => {
      const { listCustomPatterns } = await import('./custom-patterns')
      const patterns = await listCustomPatterns(session)

      expect(selectMock).toHaveBeenCalledWith('*')
      expect(eqSelectMock).toHaveBeenCalledWith('user_id', 'user-1')
      expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: true })
      expect(patterns).toHaveLength(1)
    })

    it('maps snake_case row fields to camelCase CustomPattern', async () => {
      const { listCustomPatterns } = await import('./custom-patterns')
      const [pattern] = await listCustomPatterns(session)

      expect(pattern).toEqual({
        id: 'cp-1',
        pattern: 'devoto',
        matchType: 'contains',
        category: 'groceries',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    })

    it('returns empty array when no rows exist', async () => {
      orderMock.mockResolvedValue({ data: null, error: null })

      const { listCustomPatterns } = await import('./custom-patterns')
      const patterns = await listCustomPatterns(session)

      expect(patterns).toEqual([])
    })

    it('throws when Supabase returns an error', async () => {
      orderMock.mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      })

      const { listCustomPatterns } = await import('./custom-patterns')
      await expect(listCustomPatterns(session)).rejects.toThrow(
        'connection refused'
      )
    })
  })

  describe('upsertCustomPattern', () => {
    it('maps camelCase fields to snake_case row and includes user_id', async () => {
      const { upsertCustomPattern } = await import('./custom-patterns')
      await upsertCustomPattern(session, {
        id: 'cp-1',
        pattern: 'devoto',
        matchType: 'contains',
        category: 'groceries',
        createdAt: '2026-01-01T00:00:00.000Z',
      })

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          id: 'cp-1',
          pattern: 'devoto',
          match_type: 'contains',
          category: 'groceries',
        }),
        { onConflict: 'user_id,id' }
      )
    })

    it('throws when Supabase returns an error', async () => {
      upsertMock.mockResolvedValue({ error: { message: 'upsert failed' } })

      const { upsertCustomPattern } = await import('./custom-patterns')
      await expect(
        upsertCustomPattern(session, {
          id: 'cp-1',
          pattern: 'devoto',
          matchType: 'contains',
          category: 'groceries',
          createdAt: '2026-01-01T00:00:00.000Z',
        })
      ).rejects.toThrow('upsert failed')
    })
  })

  describe('deleteCustomPattern', () => {
    it('deletes by user_id and pattern id', async () => {
      const { deleteCustomPattern } = await import('./custom-patterns')
      await deleteCustomPattern(session, 'cp-1')

      expect(deleteMock).toHaveBeenCalledTimes(1)
      expect(eqDeleteUserMock).toHaveBeenCalledWith('user_id', 'user-1')
      expect(eqDeleteIdMock).toHaveBeenCalledWith('id', 'cp-1')
    })

    it('throws when Supabase returns an error', async () => {
      eqDeleteIdMock.mockResolvedValue({ error: { message: 'delete failed' } })

      const { deleteCustomPattern } = await import('./custom-patterns')
      await expect(deleteCustomPattern(session, 'cp-1')).rejects.toThrow(
        'delete failed'
      )
    })
  })

  describe('deleteAllCustomPatterns', () => {
    it('deletes all patterns for the user', async () => {
      eqDeleteUserMock.mockResolvedValue({ error: null })

      const { deleteAllCustomPatterns } = await import('./custom-patterns')
      await deleteAllCustomPatterns(session)

      expect(deleteMock).toHaveBeenCalledTimes(1)
      expect(eqDeleteUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('throws when Supabase returns an error', async () => {
      eqDeleteUserMock.mockResolvedValue({ error: { message: 'bulk delete failed' } })

      const { deleteAllCustomPatterns } = await import('./custom-patterns')
      await expect(deleteAllCustomPatterns(session)).rejects.toThrow(
        'bulk delete failed'
      )
    })
  })
})
