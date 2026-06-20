import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { transactionStore } from '../stores/transaction-store'
import {
  getCurrentSession,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
  updatePassword,
} from '../services/supabase/auth'
import type { SupabaseSession } from '../services/supabase/client'
import { setActiveSupabaseSession } from '../services/supabase/runtime'
import { mapAuthError } from '../utils/auth-errors'

function isPasswordResetMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hashParams = new URLSearchParams(hash)
  const isRecoveryHash =
    hashParams.get('type') === 'recovery' &&
    hashParams.has('access_token')

  return (
    new URLSearchParams(window.location.search).get('mode') ===
      'reset-password' || isRecoveryHash
  )
}

function clearPasswordResetModeFromUrl(): void {
  if (typeof window === 'undefined') {
    return
  }

  const url = new URL(window.location.href)
  const hasQueryMode = url.searchParams.has('mode')

  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  const hashParams = new URLSearchParams(rawHash)
  const hasRecoveryHash =
    hashParams.get('type') === 'recovery' && hashParams.has('access_token')

  if (!hasQueryMode && !hasRecoveryHash) {
    return
  }

  if (hasQueryMode) {
    url.searchParams.delete('mode')
  }

  const nextQuery = url.searchParams.toString()
  window.history.replaceState(
    {},
    '',
    `${url.pathname}${nextQuery ? `?${nextQuery}` : ''}${hasRecoveryHash ? '' : url.hash}`
  )
}

export function useAuthSession() {
  const [session, setSession] = useState<SupabaseSession | null>(() =>
    getCurrentSession()
  )
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'reset'>(() =>
    isPasswordResetMode() ? 'reset' : 'signin'
  )

  useEffect(() => {
    setActiveSupabaseSession(session)
  }, [session])

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(
      (nextSession) => {
        setSession(nextSession)
      },
      () => {
        setAuthMode('reset')
        setAuthError('')
        setAuthNotice('Ingresá una nueva contraseña para tu cuenta')
      }
    )

    return () => {
      unsubscribe()
    }
  }, [])

  async function handleAuth(action: 'signin' | 'signup') {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      const nextSession =
        action === 'signin'
          ? await signInWithPassword(email, password)
          : await signUpWithPassword(email, password)
      setSession(nextSession)
      toast.success('Sesión iniciada')
    } catch (error) {
      setAuthError(mapAuthError(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handlePasswordReset() {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      await requestPasswordReset(email)
      setAuthNotice('Te enviamos un email para restablecer tu contraseña')
    } catch (error) {
      setAuthError(mapAuthError(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handlePasswordUpdate() {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      await updatePassword(password)
      try {
        await signOut(session)
      } catch {
        // Ignore sign-out errors after a successful password change.
      }
      setSession(null)
      transactionStore.getState().clearTransactions()
      setPassword('')
      setAuthMode('signin')
      clearPasswordResetModeFromUrl()
      setAuthNotice('Contraseña actualizada. Iniciá sesión nuevamente')
    } catch (error) {
      setAuthError(mapAuthError(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  return {
    session,
    setSession,
    authSubmitting,
    setAuthSubmitting,
    authError,
    setAuthError,
    authNotice,
    setAuthNotice,
    email,
    setEmail,
    password,
    setPassword,
    authMode,
    setAuthMode,
    handleAuth,
    handlePasswordReset,
    handlePasswordUpdate,
    clearPasswordResetModeFromUrl,
  }
}
