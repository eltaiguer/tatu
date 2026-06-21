import type { SupabaseSession } from '../services/supabase/client'

export function getFriendlyName(session: SupabaseSession | null): string {
  if (!session?.user) return ''

  const displayName =
    session.user.user_metadata?.display_name ||
    session.user.user_metadata?.full_name
  if (typeof displayName === 'string' && displayName.trim()) {
    const first = displayName.trim().split(/\s+/)[0]
    return first.charAt(0).toUpperCase() + first.slice(1)
  }

  const email = session.user.email
  if (!email) return ''

  const localPart = email.split('@')[0]
  // Split on separators, take the first segment, strip trailing digits
  const firstSegment = localPart.split(/[._-]/)[0].replace(/\d+$/, '')
  if (!firstSegment) return ''

  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
}
