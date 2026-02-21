import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

const SESSION_STORAGE_KEY = 'tatu:supabase:session'

export type SupabaseSession = Session
export type SupabaseUser = Session['user']

let supabaseClient: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
}

export function getSupabaseUrl(): string {
  if (!SUPABASE_URL) {
    throw new Error('Falta configurar VITE_SUPABASE_URL')
  }
  return SUPABASE_URL
}

export function getSupabaseAnonKey(): string {
  if (!VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY) {
    throw new Error('Falta configurar VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY')
  }
  return VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(getSupabaseUrl(), getSupabaseAnonKey())
  }
  return supabaseClient
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
