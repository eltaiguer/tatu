import { describe, it, expect } from 'vitest'
import { getFriendlyName } from './user-display'
import type { SupabaseSession } from '../services/supabase/client'

function makeSession(overrides: {
  full_name?: string
  email?: string
}): SupabaseSession {
  return {
    user: {
      id: 'test-id',
      email: overrides.email,
      user_metadata: overrides.full_name
        ? { full_name: overrides.full_name }
        : {},
    },
  } as unknown as SupabaseSession
}

describe('getFriendlyName', () => {
  it('returns the first name from full_name metadata', () => {
    expect(getFriendlyName(makeSession({ full_name: 'Maria Perez' }))).toBe('Maria')
  })

  it('capitalizes the first letter of full_name', () => {
    expect(getFriendlyName(makeSession({ full_name: 'jose gazzano' }))).toBe('Jose')
  })

  it('handles single-word full_name', () => {
    expect(getFriendlyName(makeSession({ full_name: 'Admin' }))).toBe('Admin')
  })

  it('derives name from email local-part when no full_name', () => {
    expect(getFriendlyName(makeSession({ email: 'jose@example.com' }))).toBe('Jose')
  })

  it('strips trailing digits from email local-part', () => {
    expect(getFriendlyName(makeSession({ email: 'jgazzano10@example.com' }))).toBe('Jgazzano')
  })

  it('takes first dot-separated segment from email', () => {
    expect(getFriendlyName(makeSession({ email: 'maria.perez@example.com' }))).toBe('Maria')
  })

  it('takes first underscore-separated segment from email', () => {
    expect(getFriendlyName(makeSession({ email: 'maria_perez@example.com' }))).toBe('Maria')
  })

  it('returns empty string when session is null', () => {
    expect(getFriendlyName(null)).toBe('')
  })

  it('returns empty string when no email and no full_name', () => {
    const session = {
      user: { id: 'x', user_metadata: {} },
    } as unknown as SupabaseSession
    expect(getFriendlyName(session)).toBe('')
  })

  it('prefers full_name over email', () => {
    expect(
      getFriendlyName(
        makeSession({ full_name: 'Carlos', email: 'other@example.com' })
      )
    ).toBe('Carlos')
  })
})
