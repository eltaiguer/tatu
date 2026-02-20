const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const SESSION_STORAGE_KEY = 'tatu:supabase:session'

export interface SupabaseUser {
  id: string
  email?: string
}

export interface SupabaseSession {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at: number
  user: SupabaseUser
}

export interface SupabaseAuthResponse {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  user?: SupabaseUser
  error_description?: string
  msg?: string
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export function getSupabaseUrl(): string {
  if (!SUPABASE_URL) {
    throw new Error('Falta configurar VITE_SUPABASE_URL')
  }
  return SUPABASE_URL
}

export function getSupabaseAnonKey(): string {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('Falta configurar VITE_SUPABASE_ANON_KEY')
  }
  return SUPABASE_ANON_KEY
}

export function loadStoredSession(): SupabaseSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as SupabaseSession
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function storeSession(session: SupabaseSession): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function buildSession(
  response: SupabaseAuthResponse
): SupabaseSession | null {
  if (
    !response.access_token ||
    !response.refresh_token ||
    !response.token_type ||
    !response.expires_in ||
    !response.user?.id
  ) {
    return null
  }

  const nowInSeconds = Math.floor(Date.now() / 1000)
  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    token_type: response.token_type,
    expires_in: response.expires_in,
    expires_at: nowInSeconds + response.expires_in,
    user: response.user,
  }
}

export async function supabaseFetch<TResponse>(
  path: string,
  init: RequestInit,
  accessToken?: string
): Promise<TResponse> {
  const headers = new Headers(init.headers ?? {})
  headers.set('apikey', getSupabaseAnonKey())

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let message = `Supabase error (${response.status})`
    try {
      const data = (await response.json()) as {
        message?: string
        error_description?: string
        msg?: string
      }
      message =
        data.error_description ??
        data.message ??
        data.msg ??
        `Supabase error (${response.status})`
    } catch {
      // keep default message
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return null as TResponse
  }

  return (await response.json()) as TResponse
}
