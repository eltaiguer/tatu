import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectMock, eqUserMock, singleMock, upsertMock, fromMock } = vi.hoisted(
  () => ({
    selectMock: vi.fn(),
    eqUserMock: vi.fn(),
    singleMock: vi.fn(),
    upsertMock: vi.fn(),
    fromMock: vi.fn(),
  })
)

vi.mock('./client', () => ({
  getSupabaseClient: () => ({
    from: fromMock,
  }),
}))

const userId = 'user-1'

describe('supabase ai-insights service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqUserMock.mockReturnValue({ maybeSingle: singleMock })
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
    const row = await loadCachedInsights(userId)

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(row).toEqual({
      inputHash: 'abc123',
      model: 'claude-opus-4-8',
      insights: { insights: [] },
      generatedAt: '2026-06-30T12:00:00.000Z',
    })
  })

  it('returns null when no cached row exists (no error, no data)', async () => {
    singleMock.mockResolvedValue({ data: null, error: null })
    const { loadCachedInsights } = await import('./ai-insights')

    await expect(loadCachedInsights(userId)).resolves.toBeNull()
  })

  it('returns null when several rows exist (PGRST116)', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })

    const { loadCachedInsights } = await import('./ai-insights')
    const row = await loadCachedInsights(userId)

    expect(row).toBeNull()
  })

  it.each(['PGRST205', '42P01'])(
    'explains a missing insights table (%s) instead of passing the raw text on',
    async (code) => {
      singleMock.mockResolvedValue({
        data: null,
        error: {
          code,
          message:
            "Could not find the table 'public.ai_insights' in the schema cache",
        },
      })

      const { loadCachedInsights } = await import('./ai-insights')
      const { UserFacingError } = await import('../../utils/user-error')
      const error = await loadCachedInsights(userId).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(UserFacingError)
      expect((error as Error).message).not.toMatch(/schema cache/)
    }
  )

  it('throws on an unexpected error', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: 'OTHER', message: 'boom' },
    })

    const { loadCachedInsights } = await import('./ai-insights')
    await expect(loadCachedInsights(userId)).rejects.toThrow('boom')
  })

  it('upserts insights with user ownership keyed on user_id alone', async () => {
    const { saveInsights } = await import('./ai-insights')
    await saveInsights(userId, {
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
