import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  endSession,
  teardownWorkspace,
  workspaceStore,
} from '../stores/workspace-store'
import type { AuthPort, AuthSession } from '../services/auth/auth-port'
import { setErrorReportingUser } from '../services/monitoring/error-reporting'
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

/** The signed-in session and the sign-in screen's state, over `auth`. */
export function useAuthSession(auth: AuthPort) {
  const [session, setSessionState] = useState<AuthSession | null>(() =>
    auth.getSession()
  )
  // Every session change goes through here. When the session ends or turns
  // into another user, the previous user's workspace is torn down before the
  // new session is rendered, so no frame ever pairs one user's session with
  // another user's data (#117).
  const setSession = useCallback((next: AuthSession | null) => {
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

  // A load clears the auth messages (they belong to the screen before it),
  // except a message set by the very transition that triggers the load.
  const keepMessagesRef = useRef(false)
  const keepMessagesThroughNextLoad = useCallback(() => {
    keepMessagesRef.current = true
  }, [])
  const clearMessagesForLoad = useCallback(() => {
    if (keepMessagesRef.current) {
      keepMessagesRef.current = false
      return
    }
    setAuthError('')
    setAuthNotice('')
  }, [])

  useEffect(() => {
    setErrorReportingUser(session?.user?.id ?? null)
  }, [session?.user?.id])

  useEffect(() => {
    const unsubscribe = auth.onAuthChange(
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
  }, [auth, setSession])

  async function handleAuth(action: 'signin' | 'signup') {
    setAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      const nextSession =
        action === 'signin'
          ? await auth.signIn(email, password)
          : await auth.signUp(email, password)
      setSession(nextSession)
      toast.success('Sesión iniciada')
    } catch (error) {
      setAuthError(mapAuthError(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handlePasswordReset() {
    setAuthError('')
    if (!email.trim()) {
      setAuthNotice('Ingresá tu email para restablecer la contraseña')
      return
    }
    setAuthSubmitting(true)
    setAuthNotice('')

    try {
      await auth.requestPasswordReset(email)
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
      await auth.updatePassword(password)
      // A failed sign-out is not an error here: the password did change. If
      // the session could not even be removed from this device, the user
      // simply stays signed in (with the new password) and the app loads.
      const ended = await endSession(auth)
      const stillSignedIn = ended === 'still-signed-in'
      if (stillSignedIn) keepMessagesThroughNextLoad()
      setSession(auth.getSession())
      setPassword('')
      setAuthMode('signin')
      clearPasswordResetModeFromUrl()
      setAuthNotice(
        stillSignedIn
          ? 'Contraseña actualizada.'
          : 'Contraseña actualizada. Iniciá sesión nuevamente'
      )
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
    keepMessagesThroughNextLoad,
    clearMessagesForLoad,
  }
}
