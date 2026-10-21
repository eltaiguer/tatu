import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteMock, eqMock, fromMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
}))

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../monitoring/error-reporting')>()),
  captureError: reporting.captureError,
}))
vi.mock('./client', () => ({
  getSupabaseClient: () => ({ from: fromMock }),
}))

const userId = 'user-1'

describe('supabase reset service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqMock.mockResolvedValue({ error: null })
    deleteMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ delete: deleteMock })
  })

  it('deletes all user data from supabase tables', async () => {
    const { resetUserSupabaseData } = await import('./reset')
    await resetUserSupabaseData(userId)

    expect(fromMock).toHaveBeenCalledTimes(8)
    // Cached insights were computed from the deleted data.
    expect(fromMock).toHaveBeenCalledWith('ai_insights')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('still succeeds when the insights table is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    eqMock.mockImplementation(async () => ({ error: null }))
    fromMock.mockImplementation((table: string) => ({
      delete: () => ({
        eq: async () =>
          table === 'ai_insights'
            ? { error: { message: 'relation "ai_insights" does not exist' } }
            : { error: null },
      }),
    }))

    const { resetUserSupabaseData } = await import('./reset')
    await expect(resetUserSupabaseData(userId)).resolves.toBeUndefined()
    // Expected until schema.sql is applied by hand; not a bug.
    expect(reporting.captureError).not.toHaveBeenCalled()
  })
})
