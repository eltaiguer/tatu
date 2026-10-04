import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SupabaseSession } from '../services/supabase/client'
import type { Transaction } from '../models'

const auth = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUpWithPassword: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('../services/supabase/auth', () => auth)

import { useAuthSession } from './useAuthSession'
import { getActiveSupabaseSession } from '../services/supabase/runtime'
import { transactionStore } from '../stores/transaction-store'
import { teardownWorkspace, workspaceStore } from '../stores/workspace-store'

function makeSession(userId = 'user-1'): SupabaseSession {
  return {
    access_token: `token-${userId}`,
    user: { id: userId, email: 'jose@example.uy' },
  } as SupabaseSession
}

const someTransaction: Transaction = {
  id: 'tx-1',
  date: new Date('2025-03-10T12:00:00'),
  description: 'SUPERMERCADO ABC',
  amount: 100,
  currency: 'USD',
  type: 'debit',
  source: 'bank_account',
  rawData: {},
}

// Callbacks the hook registered with Supabase's auth listener.
let onSessionChange: (session: SupabaseSession | null) => void
let onPasswordRecovery: () => void
const unsubscribe = vi.fn()

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getCurrentSession.mockReturnValue(null)
    auth.subscribeToAuthChanges.mockImplementation(
      (
        sessionCb: (session: SupabaseSession | null) => void,
        recoveryCb: () => void
      ) => {
        onSessionChange = sessionCb
        onPasswordRecovery = recoveryCb
        return unsubscribe
      }
    )
    teardownWorkspace()
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  describe('session restore', () => {
    it('starts signed out when there is no stored session', () => {
      const { result } = renderHook(() => useAuthSession())

      expect(result.current.session).toBeNull()
      expect(result.current.authMode).toBe('signin')
      expect(getActiveSupabaseSession()).toBeNull()
    })

    it('restores the stored session and makes it active for data services', () => {
      const stored = makeSession()
      auth.getCurrentSession.mockReturnValue(stored)

      const { result } = renderHook(() => useAuthSession())

      expect(result.current.session).toBe(stored)
      expect(getActiveSupabaseSession()).toBe(stored)
    })

    it('stops listening to auth changes on unmount', () => {
      const { unmount } = renderHook(() => useAuthSession())

      unmount()
      expect(unsubscribe).toHaveBeenCalledTimes(1)
    })
  })

  describe('sign-in', () => {
    it('signs in with the entered email and password', async () => {
      const next = makeSession()
      auth.signInWithPassword.mockResolvedValue(next)
      const { result } = renderHook(() => useAuthSession())

      act(() => {
        result.current.setEmail('jose@example.uy')
        result.current.setPassword('secret123')
      })
      await act(() => result.current.handleAuth('signin'))

      expect(auth.signInWithPassword).toHaveBeenCalledWith(
        'jose@example.uy',
        'secret123'
      )
      expect(auth.signUpWithPassword).not.toHaveBeenCalled()
      expect(result.current.session).toBe(next)
      expect(getActiveSupabaseSession()).toBe(next)
      expect(result.current.authSubmitting).toBe(false)
      expect(result.current.authError).toBe('')
    })

    it('signs up with the entered email and password', async () => {
      const next = makeSession('user-2')
      auth.signUpWithPassword.mockResolvedValue(next)
      const { result } = renderHook(() => useAuthSession())

      act(() => {
        result.current.setEmail('nuevo@example.uy')
        result.current.setPassword('secret123')
      })
      await act(() => result.current.handleAuth('signup'))

      expect(auth.signUpWithPassword).toHaveBeenCalledWith(
        'nuevo@example.uy',
        'secret123'
      )
      expect(result.current.session).toBe(next)
    })

    it('shows a friendly error and stays signed out when credentials are wrong', async () => {
      auth.signInWithPassword.mockRejectedValue(
        new Error('Invalid login credentials')
      )
      const { result } = renderHook(() => useAuthSession())

      await act(() => result.current.handleAuth('signin'))

      expect(result.current.session).toBeNull()
      expect(result.current.authError).toBe('Email o contraseña incorrectos.')
      expect(result.current.authSubmitting).toBe(false)
    })

    it('picks up a session that arrives from the auth listener', () => {
      const { result } = renderHook(() => useAuthSession())
      const next = makeSession()

      act(() => onSessionChange(next))

      expect(result.current.session).toBe(next)
      expect(getActiveSupabaseSession()).toBe(next)
    })
  })

  describe('sign-out', () => {
    it('clears the session when Supabase reports a sign-out', () => {
      auth.getCurrentSession.mockReturnValue(makeSession())
      const { result } = renderHook(() => useAuthSession())

      act(() => onSessionChange(null))

      expect(result.current.session).toBeNull()
      expect(getActiveSupabaseSession()).toBeNull()
    })

    it('drops the previous user’s workspace before a different user’s session renders', () => {
      auth.getCurrentSession.mockReturnValue(makeSession('user-a'))
      workspaceStore.setState({ userId: 'user-a', status: 'ready' })
      transactionStore.getState().setTransactions([someTransaction])
      const { result } = renderHook(() => useAuthSession())

      // e.g. user B signs in from another tab.
      act(() => onSessionChange(makeSession('user-b')))

      expect(result.current.session?.user.id).toBe('user-b')
      expect(workspaceStore.getState().userId).toBeNull()
      expect(transactionStore.getState().transactions).toEqual([])
    })

    it('keeps the workspace when the same user’s token is refreshed', () => {
      auth.getCurrentSession.mockReturnValue(makeSession('user-a'))
      workspaceStore.setState({ userId: 'user-a', status: 'ready' })
      transactionStore.getState().setTransactions([someTransaction])
      renderHook(() => useAuthSession())

      act(() => onSessionChange(makeSession('user-a')))

      expect(workspaceStore.getState().userId).toBe('user-a')
      expect(transactionStore.getState().transactions).toHaveLength(1)
    })

    it('signs out and clears loaded transactions after a password change', async () => {
      const current = makeSession()
      auth.getCurrentSession.mockReturnValue(current)
      auth.updatePassword.mockResolvedValue(undefined)
      auth.signOut.mockResolvedValue(undefined)
      transactionStore.getState().setTransactions([someTransaction])
      window.history.replaceState({}, '', '/?mode=reset-password')

      const { result } = renderHook(() => useAuthSession())
      expect(result.current.authMode).toBe('reset')

      act(() => result.current.setPassword('nueva-clave'))
      await act(() => result.current.handlePasswordUpdate())

      expect(auth.updatePassword).toHaveBeenCalledWith('nueva-clave')
      expect(auth.signOut).toHaveBeenCalledWith(current)
      expect(result.current.session).toBeNull()
      expect(getActiveSupabaseSession()).toBeNull()
      expect(transactionStore.getState().transactions).toEqual([])
      expect(result.current.password).toBe('')
      expect(result.current.authMode).toBe('signin')
      expect(result.current.authNotice).toBe(
        'Contraseña actualizada. Iniciá sesión nuevamente'
      )
      expect(window.location.search).not.toContain('mode=')
    })

    it('still clears state when signing out after a password change fails', async () => {
      auth.getCurrentSession.mockReturnValue(makeSession())
      auth.updatePassword.mockResolvedValue(undefined)
      auth.signOut.mockRejectedValue(new Error('network down'))
      transactionStore.getState().setTransactions([someTransaction])

      const { result } = renderHook(() => useAuthSession())
      await act(() => result.current.handlePasswordUpdate())

      expect(result.current.session).toBeNull()
      expect(transactionStore.getState().transactions).toEqual([])
      expect(result.current.authError).toBe('')
    })

    it('keeps the session when the password change itself fails', async () => {
      const current = makeSession()
      auth.getCurrentSession.mockReturnValue(current)
      auth.updatePassword.mockRejectedValue(
        new Error('Password should be at least 6 characters')
      )
      transactionStore.getState().setTransactions([someTransaction])

      const { result } = renderHook(() => useAuthSession())
      await act(() => result.current.handlePasswordUpdate())

      expect(auth.signOut).not.toHaveBeenCalled()
      expect(result.current.session).toBe(current)
      expect(transactionStore.getState().transactions).toHaveLength(1)
      expect(result.current.authError).toBe(
        'La contraseña debe tener al menos 6 caracteres.'
      )
    })
  })

  describe('password reset', () => {
    it('enters reset mode when the recovery link is opened', () => {
      const { result } = renderHook(() => useAuthSession())

      act(() => onPasswordRecovery())

      expect(result.current.authMode).toBe('reset')
      expect(result.current.authNotice).toBe(
        'Ingresá una nueva contraseña para tu cuenta'
      )
    })

    it('requests a reset email for the entered address', async () => {
      auth.requestPasswordReset.mockResolvedValue(undefined)
      const { result } = renderHook(() => useAuthSession())

      act(() => result.current.setEmail('jose@example.uy'))
      await act(() => result.current.handlePasswordReset())

      expect(auth.requestPasswordReset).toHaveBeenCalledWith('jose@example.uy')
      expect(result.current.authNotice).toBe(
        'Te enviamos un email para restablecer tu contraseña'
      )
    })
  })
})
