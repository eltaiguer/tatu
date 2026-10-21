import {
  clearStoredSession,
  getSupabaseClient,
  isSupabaseConfigured,
  loadStoredSession,
  storeSession,
  type SupabaseSession,
} from './client'

export function getCurrentSession(): SupabaseSession | null {
  if (!isSupabaseConfigured()) {
    return null
  }

  return loadStoredSession()
}

function getPasswordRecoveryRedirectUrl(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const configuredRedirectUrl =
    import.meta.env.VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL?.trim()
  // The app root, not the current deep path: Supabase only honors
  // allow-listed redirects, and the root is the one that's listed.
  const fallbackRedirectUrl = `${window.location.origin}/`
  const url = new URL(configuredRedirectUrl || fallbackRedirectUrl)
  url.searchParams.set('mode', 'reset-password')
  return url.toString()
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<SupabaseSession> {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.session) {
    throw new Error('No se pudo iniciar sesión')
  }

  storeSession(data.session)
  return data.session
}

export async function signUpWithPassword(
  email: string,
  password: string
): Promise<SupabaseSession> {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.session) {
    throw new Error('No se pudo crear la cuenta. Verificá tu email.')
  }

  storeSession(data.session)
  return data.session
}

/**
 * Signs out everywhere (global scope). If that request fails (5xx, offline),
 * supabase-js keeps its session — it would sign the user back in on the next
 * refresh — so this falls back to the local scope, which revokes only this
 * device's token and removes the session here. Either way a failure of the
 * global sign-out is rethrown, for the caller to report. If even the local
 * sign-out fails, the session is kept (here and in supabase-js) and the user
 * is still signed in.
 */
export async function signOut(): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.auth.signOut()
  if (!error) {
    clearStoredSession()
    return
  }
  const { error: localError } = await client.auth.signOut({ scope: 'local' })
  if (!localError) clearStoredSession()
  throw new Error(error.message)
}

export async function requestPasswordReset(email: string): Promise<void> {
  const client = getSupabaseClient()
  const redirectTo = getPasswordRecoveryRedirectUrl()
  const { error } = await client.auth.resetPasswordForEmail(
    email,
    redirectTo
      ? {
          redirectTo,
        }
      : undefined
  )
  if (error) {
    throw new Error(error.message)
  }
}

export async function updatePassword(password: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.auth.updateUser({
    password,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export function subscribeToAuthChanges(
  onSessionChange: (session: SupabaseSession | null) => void,
  onPasswordRecovery?: () => void
): () => void {
  const client = getSupabaseClient()
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event, nextSession) => {
    if (event === 'SIGNED_OUT') {
      clearStoredSession()
      onSessionChange(null)
      return
    }

    if (!nextSession) {
      return
    }

    storeSession(nextSession)
    onSessionChange(nextSession)

    if (event === 'PASSWORD_RECOVERY') {
      onPasswordRecovery?.()
    }
  })

  return () => {
    subscription.unsubscribe()
  }
}
