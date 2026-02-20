import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()

describe('supabase auth service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key')
    localStorage.clear()
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('signs in and persists session in localStorage', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 'user-1', email: 'test@example.com' },
      }),
    })

    const { signInWithPassword, getCurrentSession } = await import('./auth')
    const session = await signInWithPassword('test@example.com', 'secret123')

    expect(session.user.id).toBe('user-1')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
      })
    )

    const storedSession = getCurrentSession()
    expect(storedSession?.access_token).toBe('access-token')
  })

  it('signs out and clears session', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 'user-1', email: 'test@example.com' },
      }),
    })
    const { signInWithPassword, signOut, getCurrentSession } =
      await import('./auth')
    const session = await signInWithPassword('test@example.com', 'secret123')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    })

    await signOut(session)

    expect(getCurrentSession()).toBeNull()
  })

  it('requests password reset email', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    })

    const { requestPasswordReset } = await import('./auth')
    await requestPasswordReset('test@example.com')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/recover',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })
})
