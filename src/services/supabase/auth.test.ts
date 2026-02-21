import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  signInWithPasswordMock,
  signUpMock,
  signOutMock,
  resetPasswordForEmailMock,
  loadStoredSessionMock,
  storeSessionMock,
  clearStoredSessionMock,
} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  signOutMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  loadStoredSessionMock: vi.fn(),
  storeSessionMock: vi.fn(),
  clearStoredSessionMock: vi.fn(),
}))

vi.mock('./client', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  loadStoredSession: loadStoredSessionMock,
  storeSession: storeSessionMock,
  clearStoredSession: clearStoredSessionMock,
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      signOut: signOutMock,
      resetPasswordForEmail: resetPasswordForEmailMock,
    },
  }),
}))

describe('supabase auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs in and stores session', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    const { signInWithPassword } = await import('./auth')
    const session = await signInWithPassword('test@example.com', 'secret123')

    expect(session.user.id).toBe('user-1')
    expect(storeSessionMock).toHaveBeenCalledTimes(1)
  })

  it('signs up and stores session', async () => {
    signUpMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    const { signUpWithPassword } = await import('./auth')
    const session = await signUpWithPassword('test@example.com', 'secret123')

    expect(session.user.id).toBe('user-1')
    expect(storeSessionMock).toHaveBeenCalledTimes(1)
  })

  it('signs out and clears stored session', async () => {
    signOutMock.mockResolvedValue({ error: null })

    const { signOut } = await import('./auth')
    await signOut(null)

    expect(clearStoredSessionMock).toHaveBeenCalledTimes(1)
  })

  it('requests password reset email', async () => {
    resetPasswordForEmailMock.mockResolvedValue({ error: null })

    const { requestPasswordReset } = await import('./auth')
    await requestPasswordReset('test@example.com')

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith('test@example.com')
  })

  it('returns current session when configured', async () => {
    loadStoredSessionMock.mockReturnValue({
      access_token: 'access-token',
      user: { id: 'user-1' },
    })

    const { getCurrentSession } = await import('./auth')
    expect(getCurrentSession()).toEqual({
      access_token: 'access-token',
      user: { id: 'user-1' },
    })
  })
})
