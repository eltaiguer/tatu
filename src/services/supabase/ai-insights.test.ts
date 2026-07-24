import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const { selectMock, eqUserMock, singleMock, upsertMock, fromMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqUserMock: vi.fn(),
  singleMock: vi.fn(),
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./client', () => ({
  getSupabaseClient: () => ({
    from: fromMock,
  }),
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

describe('supabase ai-insights service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqUserMock.mockReturnValue({ single: singleMock })
    selectMock.mockReturnValue({ eq: eqUserMock })

    upsertMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'ai_insights') {
        throw new Error('unexpected table')
      }
      return {
        select: selectMock,
        upsert: upsertMock,
      }
    })
  })

  it('loads the cached insights row for the current user and maps snake_case to camelCase', async () => {
    singleMock.mockResolvedValue({
      data: {
        user_id: 'user-1',
        input_hash: 'abc123',
        model: 'claude-opus-4-8',
        insights: { insights: [] },
        generated_at: '2026-06-30T12:00:00.000Z',
      },
      error: null,
    })

    const { loadCachedInsights } = await import('./ai-insights')
    const row = await loadCachedInsights(session)

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(row).toEqual({
      inputHash: 'abc123',
      model: 'claude-opus-4-8',
      insights: { insights: [] },
      generatedAt: '2026-06-30T12:00:00.000Z',
    })
  })

  it('returns null when no cached row exists (PGRST116)', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })

    const { loadCachedInsights } = await import('./ai-insights')
    const row = await loadCachedInsights(session)

    expect(row).toBeNull()
  })

  it('throws on an unexpected error', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: 'OTHER', message: 'boom' },
    })

    const { loadCachedInsights } = await import('./ai-insights')
    await expect(loadCachedInsights(session)).rejects.toThrow('boom')
  })

  it('upserts insights with user ownership keyed on user_id alone', async () => {
    const { saveInsights } = await import('./ai-insights')
    await saveInsights(session, {
      inputHash: 'abc123',
      model: 'claude-opus-4-8',
      insights: { insights: [] },
    })

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: 'user-1',
        input_hash: 'abc123',
        model: 'claude-opus-4-8',
        insights: { insights: [] },
      },
      { onConflict: 'user_id' }
    )
  })
})
