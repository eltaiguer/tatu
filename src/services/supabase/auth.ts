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

export async function signOut(
  session: SupabaseSession | null | undefined
): Promise<void> {
  void session
  const client = getSupabaseClient()
  try {
    const { error } = await client.auth.signOut()
    if (error) {
      throw new Error(error.message)
    }
  } finally {
    clearStoredSession()
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.auth.resetPasswordForEmail(email)
  if (error) {
    throw new Error(error.message)
  }
}
