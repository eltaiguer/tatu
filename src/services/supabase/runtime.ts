import type { SupabaseSession } from './client'

let activeSupabaseSession: SupabaseSession | null = null

export function setActiveSupabaseSession(
  session: SupabaseSession | null
): void {
  activeSupabaseSession = session
}

export function getActiveSupabaseSession(): SupabaseSession | null {
  return activeSupabaseSession
}
