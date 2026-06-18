import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const { fromMock, selectMock, eqMock, singleMock, upsertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  singleMock: vi.fn(),
  upsertMock: vi.fn(),
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

describe('user-preferences service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    singleMock.mockResolvedValue({
      data: {
        user_id: 'user-1',
        theme: 'dark',
        currency: 'UYU',
        fx_rate: 42.5,
        claude_api_key: null,
        ai_enabled: false,
        ai_model: 'claude-haiku-4-5',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    })

    eqMock.mockReturnValue({ single: singleMock })
    selectMock.mockReturnValue({ eq: eqMock })
    upsertMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'user_preferences') throw new Error(`unexpected table: ${table}`)
      return { select: selectMock, upsert: upsertMock }
    })
  })

  describe('loadUserPreferences', () => {
    it('returns null when the row does not exist (PGRST116)', async () => {
      singleMock.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'no rows' },
      })

      const { loadUserPreferences } = await import('./user-preferences')
      const result = await loadUserPreferences(session)

      expect(result).toBeNull()
    })

    it('throws on other database errors', async () => {
      singleMock.mockResolvedValueOnce({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      })

      const { loadUserPreferences } = await import('./user-preferences')
      await expect(loadUserPreferences(session)).rejects.toThrow(
        'relation does not exist'
      )
    })

    it('maps row fields to the preferences shape', async () => {
      const { loadUserPreferences } = await import('./user-preferences')
      const prefs = await loadUserPreferences(session)

      expect(prefs).toEqual({
        theme: 'dark',
        currency: 'UYU',
        fxRate: 42.5,
        claudeApiKey: '',
        aiEnabled: false,
        aiModel: 'claude-haiku-4-5',
      })
    })

    it('applies defaults when row fields are null', async () => {
      singleMock.mockResolvedValueOnce({
        data: {
          user_id: 'user-1',
          theme: null,
          currency: null,
          fx_rate: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        error: null,
      })

      const { loadUserPreferences } = await import('./user-preferences')
      const prefs = await loadUserPreferences(session)

      expect(prefs?.theme).toBe('auto')
      expect(prefs?.currency).toBe('USD')
      expect(prefs?.fxRate).toBe(40.5)
    })
  })

  describe('saveUserPreferences', () => {
    it('upserts with the correct column shape and conflict target', async () => {
      const { saveUserPreferences } = await import('./user-preferences')
      await saveUserPreferences(session, {
        theme: 'light',
        currency: 'USD',
        fxRate: 38,
        claudeApiKey: '',
        aiEnabled: false,
        aiModel: 'claude-haiku-4-5',
      })

      expect(upsertMock).toHaveBeenCalledWith(
        {
          user_id: 'user-1',
          theme: 'light',
          currency: 'USD',
          fx_rate: 38,
          claude_api_key: null,
          ai_enabled: false,
          ai_model: 'claude-haiku-4-5',
        },
        { onConflict: 'user_id' }
      )
    })

    it('throws when upsert returns an error', async () => {
      upsertMock.mockResolvedValueOnce({
        error: { message: 'permission denied' },
      })

      const { saveUserPreferences } = await import('./user-preferences')
      await expect(
        saveUserPreferences(session, {
          theme: 'auto',
          currency: 'UYU',
          fxRate: 40.5,
          claudeApiKey: '',
          aiEnabled: false,
          aiModel: 'claude-haiku-4-5',
        })
      ).rejects.toThrow('permission denied')
    })
  })
})
