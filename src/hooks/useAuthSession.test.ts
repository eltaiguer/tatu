import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Transaction } from '../models'
import { useAuthSession } from './useAuthSession'
import { transactionStore } from '../stores/transaction-store'
import { teardownWorkspace, workspaceStore } from '../stores/workspace-store'
import {
  createInMemoryAuth,
  makeSession as sessionOf,
  type InMemoryAuth,
} from '../services/auth/in-memory-auth'

const makeSession = (userId = 'user-1') => sessionOf(userId)

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

let auth: InMemoryAuth
// The auth server, signed in as `session` (or signed out).
function serverWith(session: ReturnType<typeof makeSession> | null) {
  auth = createInMemoryAuth({ session })
}
const renderAuth = () => renderHook(() => useAuthSession(auth))

describe('useAuthSession', () => {
  beforeEach(() => {
    serverWith(null)
    teardownWorkspace()
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  describe('session restore', () => {
    it('starts signed out when there is no stored session', () => {
      const { result } = renderAuth()

      expect(result.current.session).toBeNull()
      expect(result.current.authMode).toBe('signin')
    })

    it('restores the stored session', () => {
      const stored = makeSession()
      serverWith(stored)

      const { result } = renderAuth()

      expect(result.current.session).toBe(stored)
    })

    it('stops listening to auth changes on unmount', () => {
      const { result, unmount } = renderAuth()

      unmount()
      auth.emit(makeSession())
      expect(result.current.session).toBeNull()
    })
  })

  describe('sign-in', () => {
    it('signs in with the entered email and password', async () => {
      const next = auth.addAccount('jose@example.uy', 'secret123')
      const { result } = renderAuth()

      act(() => {
        result.current.setEmail('jose@example.uy')
        result.current.setPassword('secret123')
      })
      await act(() => result.current.handleAuth('signin'))

      expect(result.current.session).toBe(next)
      expect(result.current.authSubmitting).toBe(false)
      expect(result.current.authError).toBe('')
    })

    it('signs up with the entered email and password', async () => {
      const { result } = renderAuth()

      act(() => {
        result.current.setEmail('nuevo@example.uy')
        result.current.setPassword('secret123')
      })
      await act(() => result.current.handleAuth('signup'))

      expect(result.current.session?.user.email).toBe('nuevo@example.uy')
      expect(auth.getSession()).toBe(result.current.session)
    })

    it('shows a friendly error and stays signed out when credentials are wrong', async () => {
      auth.addAccount('jose@example.uy', 'secret123')
      const { result } = renderAuth()
      act(() => {
        result.current.setEmail('jose@example.uy')
        result.current.setPassword('wrong')
      })

      await act(() => result.current.handleAuth('signin'))

      expect(result.current.session).toBeNull()
      expect(result.current.authError).toBe('Email o contraseña incorrectos.')
      expect(result.current.authSubmitting).toBe(false)
    })

    it('picks up a session that arrives from the auth listener', () => {
      const { result } = renderAuth()
      const next = makeSession()

      act(() => auth.emit(next))

      expect(result.current.session).toBe(next)
    })
  })

  describe('sign-out', () => {
    it('clears the session when Supabase reports a sign-out', () => {
      serverWith(makeSession())
      const { result } = renderAuth()

      act(() => auth.emit(null))

      expect(result.current.session).toBeNull()
    })

    it('drops the previous user’s workspace before a different user’s session renders', () => {
      serverWith(makeSession('user-a'))
      workspaceStore.setState({ userId: 'user-a', status: 'ready' })
      transactionStore.getState().setTransactions([someTransaction])
      const { result } = renderAuth()

      // e.g. user B signs in from another tab.
      act(() => auth.emit(makeSession('user-b')))

      expect(result.current.session?.user.id).toBe('user-b')
      expect(workspaceStore.getState().userId).toBeNull()
      expect(transactionStore.getState().transactions).toEqual([])
    })

    it('keeps the workspace when the same user’s token is refreshed', () => {
      serverWith(makeSession('user-a'))
      workspaceStore.setState({ userId: 'user-a', status: 'ready' })
      transactionStore.getState().setTransactions([someTransaction])
      renderAuth()

      act(() => auth.emit(makeSession('user-a')))

      expect(workspaceStore.getState().userId).toBe('user-a')
      expect(transactionStore.getState().transactions).toHaveLength(1)
    })

    it('signs out and clears loaded transactions after a password change', async () => {
      serverWith(makeSession())
      transactionStore.getState().setTransactions([someTransaction])
      window.history.replaceState({}, '', '/?mode=reset-password')

      const { result } = renderAuth()
      expect(result.current.authMode).toBe('reset')

      act(() => result.current.setPassword('nueva-clave'))
      await act(() => result.current.handlePasswordUpdate())

      expect(auth.passwordUpdates).toEqual(['nueva-clave'])
      expect(auth.signOuts).toBe(1)
      expect(auth.getSession()).toBeNull()
      expect(result.current.session).toBeNull()
      expect(transactionStore.getState().transactions).toEqual([])
      expect(result.current.password).toBe('')
      expect(result.current.authMode).toBe('signin')
      expect(result.current.authNotice).toBe(
        'Contraseña actualizada. Iniciá sesión nuevamente'
      )
      expect(window.location.search).not.toContain('mode=')
    })

    it('still clears state when signing out after a password change fails', async () => {
      serverWith(makeSession())
      auth.failOn('signOut', new Error('network down'))
      transactionStore.getState().setTransactions([someTransaction])

      const { result } = renderAuth()
      await act(() => result.current.handlePasswordUpdate())

      expect(result.current.session).toBeNull()
      expect(transactionStore.getState().transactions).toEqual([])
      expect(result.current.authError).toBe('')
    })

    it('stays signed in after a password change when the session cannot be removed at all', async () => {
      const current = makeSession()
      serverWith(current)
      auth.failOn('signOut', new Error('Failed to fetch'))
      auth.failOn('signOutLocal', new Error('Failed to fetch'))
      window.history.replaceState({}, '', '/?mode=reset-password')

      const { result } = renderAuth()
      await act(() => result.current.handlePasswordUpdate())

      // Supabase still holds the session: showing sign-in would be a lie.
      expect(result.current.session).toBe(current)
      expect(result.current.authMode).toBe('signin')
      expect(result.current.authNotice).toBe('Contraseña actualizada.')
    })

    it('keeps the session when the password change itself fails', async () => {
      const current = makeSession()
      serverWith(current)
      auth.failOn(
        'updatePassword',
        new Error('Password should be at least 6 characters')
      )
      transactionStore.getState().setTransactions([someTransaction])

      const { result } = renderAuth()
      await act(() => result.current.handlePasswordUpdate())

      expect(auth.signOuts).toBe(0)
      expect(result.current.session).toBe(current)
      expect(transactionStore.getState().transactions).toHaveLength(1)
      expect(result.current.authError).toBe(
        'La contraseña debe tener al menos 6 caracteres.'
      )
    })
  })

  describe('password reset', () => {
    it('enters reset mode when the recovery link is opened', () => {
      const { result } = renderAuth()

      act(() => auth.recover(makeSession()))

      expect(result.current.authMode).toBe('reset')
      expect(result.current.authNotice).toBe(
        'Ingresá una nueva contraseña para tu cuenta'
      )
    })

    it('asks for the email instead of requesting a reset without one (#204)', async () => {
      const { result } = renderAuth()

      await act(() => result.current.handlePasswordReset())

      expect(auth.resetRequests).toEqual([])
      expect(result.current.authNotice).toBe(
        'Ingresá tu email para restablecer la contraseña'
      )
    })

    it('requests a reset email for the entered address', async () => {
      const { result } = renderAuth()

      act(() => result.current.setEmail('jose@example.uy'))
      await act(() => result.current.handlePasswordReset())

      expect(auth.resetRequests).toEqual(['jose@example.uy'])
      expect(result.current.authNotice).toBe(
        'Te enviamos un email para restablecer tu contraseña'
      )
    })
  })
})
