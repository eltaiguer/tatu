import { useCallback, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { teardownWorkspace, workspaceStore } from '../stores/workspace-store'
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
    hashParams.get('type') === 'recovery' && hashParams.has('access_token')

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
  const [session, setSessionState] = useState<SupabaseSession | null>(() =>
    getCurrentSession()
  )
  // Every session change goes through here. When the session ends or turns
  // into another user, the previous user's workspace is torn down before the
  // new session is rendered, so no frame ever pairs one user's session with
  // another user's data (#117).
  const setSession = useCallback((next: SupabaseSession | null) => {
    const loadedFor = workspaceStore.getState().userId
    if (loadedFor !== null && next?.user.id !== loadedFor) {
      teardownWorkspace()
    }
    setSessionState(next)
  }, [])
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
        // SIGNED_OUT (this tab or another): drop everything of the user.
        if (!nextSession) teardownWorkspace()
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
  }, [setSession])

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
      teardownWorkspace()
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
