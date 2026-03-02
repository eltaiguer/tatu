import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

describe('supabase client service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('stores, loads, and clears session from localStorage', async () => {
    const { storeSession, loadStoredSession, clearStoredSession } = await import('./client')

    const session = {
      access_token: 'token',
      refresh_token: 'refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: 9999,
      user: { id: 'user-1', email: 'test@example.com' },
    }

    storeSession(session as never)
    expect(loadStoredSession()).toEqual(session)

    clearStoredSession()
    expect(loadStoredSession()).toBeNull()
  })

  it('returns null and clears storage when session JSON is invalid', async () => {
    localStorage.setItem('tatu:supabase:session', '{invalid-json')
    const { loadStoredSession } = await import('./client')

    expect(loadStoredSession()).toBeNull()
    expect(localStorage.getItem('tatu:supabase:session')).toBeNull()
  })

  it('creates supabase client once and reuses singleton instance', async () => {
    createClientMock.mockReturnValue({ auth: {} })

    const { getSupabaseClient } = await import('./client')
    const first = getSupabaseClient()
    const second = getSupabaseClient()

    expect(first).toBe(second)
    expect(createClientMock).toHaveBeenCalledTimes(1)
  })

  it('reports configured status based on env vars', async () => {
    const originalUrl = import.meta.env.VITE_SUPABASE_URL
    const originalKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

    import.meta.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'anon-key'
    vi.resetModules()

    const configuredClient = await import('./client')
    expect(configuredClient.isSupabaseConfigured()).toBe(true)

    import.meta.env.VITE_SUPABASE_URL = ''
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = ''
    vi.resetModules()

    const unconfiguredClient = await import('./client')
    expect(unconfiguredClient.isSupabaseConfigured()).toBe(false)

    import.meta.env.VITE_SUPABASE_URL = originalUrl
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = originalKey
  })
})
