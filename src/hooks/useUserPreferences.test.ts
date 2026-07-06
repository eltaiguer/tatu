import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { SupabaseSession } from '../services/supabase/client'

const saveUserPreferences = vi.fn(async () => {})

vi.mock('../services/supabase/user-preferences', () => ({
  saveUserPreferences: () => saveUserPreferences(),
}))
vi.mock('../services/ai/ai-config', () => ({ setAiConfig: vi.fn() }))

import { useUserPreferences } from './useUserPreferences'

function makeSession(userId: string): SupabaseSession {
  // New object identity each call — mirrors the session Supabase hands us on refocus.
  return { user: { id: userId, email: 'jose@example.uy' } } as SupabaseSession
}

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not re-save preferences when a new session object arrives with the same user id', () => {
    const { result, rerender } = renderHook(
      (s: SupabaseSession | null) => useUserPreferences(s),
      { initialProps: makeSession('user-1') }
    )

    // Preferences have been loaded from Supabase — saves are now allowed.
    act(() => {
      result.current.markPrefsLoaded()
    })

    // Simulate a token refresh / tab refocus: new session object, same user id.
    rerender(makeSession('user-1'))

    expect(saveUserPreferences).not.toHaveBeenCalled()
  })

  it('saves when a preference value actually changes', () => {
    const { result } = renderHook(
      (s: SupabaseSession | null) => useUserPreferences(s),
      { initialProps: makeSession('user-1') }
    )

    act(() => {
      result.current.markPrefsLoaded()
    })

    act(() => {
      result.current.setFxRate(42)
    })

    expect(saveUserPreferences).toHaveBeenCalledTimes(1)
  })
})
