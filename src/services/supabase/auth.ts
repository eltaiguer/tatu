import {
  buildSession,
  clearStoredSession,
  isSupabaseConfigured,
  loadStoredSession,
  storeSession,
  supabaseFetch,
  type SupabaseAuthResponse,
  type SupabaseSession,
} from './client'

function getAuthErrorMessage(response: SupabaseAuthResponse): string {
  return response.error_description ?? response.msg ?? 'Error de autenticación'
}

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
  const response = await supabaseFetch<SupabaseAuthResponse>(
    '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }
  )

  const session = buildSession(response)
  if (!session) {
    throw new Error(getAuthErrorMessage(response))
  }

  storeSession(session)
  return session
}

export async function signUpWithPassword(
  email: string,
  password: string
): Promise<SupabaseSession> {
  const response = await supabaseFetch<SupabaseAuthResponse>('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  const session = buildSession(response)
  if (!session) {
    throw new Error(
      getAuthErrorMessage(response) ||
        'No se pudo crear la cuenta. Verificá tu email.'
    )
  }

  storeSession(session)
  return session
}

export async function signOut(
  session: SupabaseSession | null | undefined
): Promise<void> {
  try {
    if (session?.access_token) {
      await supabaseFetch<null>(
        '/auth/v1/logout',
        {
          method: 'POST',
        },
        session.access_token
      )
    }
  } finally {
    clearStoredSession()
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await supabaseFetch<null>('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}
