import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  signInWithPasswordMock,
  signUpMock,
  signOutMock,
  resetPasswordForEmailMock,
  updateUserMock,
  onAuthStateChangeMock,
  unsubscribeMock,
  loadStoredSessionMock,
  storeSessionMock,
  clearStoredSessionMock,
} = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  signOutMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  updateUserMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
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
      updateUser: updateUserMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}))

describe('supabase auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    })
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

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      'test@example.com',
      expect.objectContaining({
        redirectTo: expect.stringContaining('?mode=reset-password'),
      })
    )
  })

  it('updates password for authenticated user', async () => {
    updateUserMock.mockResolvedValue({ error: null })

    const { updatePassword } = await import('./auth')
    await updatePassword('new-secret')

    expect(updateUserMock).toHaveBeenCalledWith({ password: 'new-secret' })
  })

  it('subscribes to auth changes and handles password recovery', async () => {
    const nextSession = {
      access_token: 'next-token',
      user: { id: 'user-1' },
    }
    let callback: ((event: string, session: unknown) => void) | undefined
    onAuthStateChangeMock.mockImplementation(
      (cb: (event: string, session: unknown) => void) => {
        callback = cb
        return {
          data: { subscription: { unsubscribe: unsubscribeMock } },
        }
      }
    )

    const onSessionChange = vi.fn()
    const onPasswordRecovery = vi.fn()
    const { subscribeToAuthChanges } = await import('./auth')
    const unsubscribe = subscribeToAuthChanges(
      onSessionChange,
      onPasswordRecovery
    )

    callback?.('PASSWORD_RECOVERY', nextSession)

    expect(storeSessionMock).toHaveBeenCalledWith(nextSession)
    expect(onSessionChange).toHaveBeenCalledWith(nextSession)
    expect(onPasswordRecovery).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  it('handles signed out auth change by clearing session', async () => {
    let callback: ((event: string, session: unknown) => void) | undefined
    onAuthStateChangeMock.mockImplementation(
      (cb: (event: string, session: unknown) => void) => {
        callback = cb
        return {
          data: { subscription: { unsubscribe: unsubscribeMock } },
        }
      }
    )

    const onSessionChange = vi.fn()
    const { subscribeToAuthChanges } = await import('./auth')
    subscribeToAuthChanges(onSessionChange)

    callback?.('SIGNED_OUT', null)

    expect(clearStoredSessionMock).toHaveBeenCalledTimes(1)
    expect(onSessionChange).toHaveBeenCalledWith(null)
    expect(storeSessionMock).not.toHaveBeenCalled()
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
