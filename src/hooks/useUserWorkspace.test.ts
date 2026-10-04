import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { SupabaseSession } from '../services/supabase/client'

const loadUserTransactions = vi.fn(async () => [])
const saveUserPreferences = vi.fn(async () => {})

vi.mock('../services/supabase/transactions', () => ({
  loadUserTransactions: () => loadUserTransactions(),
}))
vi.mock('../services/supabase/category-overrides', () => ({
  listCategoryOverrides: async () => [],
}))
vi.mock('../services/supabase/description-overrides', () => ({
  listDescriptionOverrides: async () => [],
}))
vi.mock('../services/supabase/custom-patterns', () => ({
  listCustomPatterns: async () => [],
}))
vi.mock('../services/supabase/custom-categories', () => ({
  listCustomCategories: async () => [],
}))
vi.mock('../services/supabase/user-preferences', () => ({
  loadUserPreferences: async () => null,
  saveUserPreferences: () => saveUserPreferences(),
}))

import { useUserWorkspace } from './useUserWorkspace'
import { teardownWorkspace } from '../stores/workspace-store'

function makeSession(userId: string): SupabaseSession {
  // New object identity each call — mirrors what Supabase hands us on refocus.
  return { user: { id: userId, email: 'jose@example.uy' } } as SupabaseSession
}

type Props = { session: SupabaseSession | null; authMode: 'signin' | 'reset' }

function renderWorkspace(initial: Props) {
  return renderHook((p: Props) => useUserWorkspace(p), {
    initialProps: initial,
  })
}

describe('useUserWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teardownWorkspace()
  })

  it('loads the signed-in user and reports ready', async () => {
    const { result } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loadUserTransactions).toHaveBeenCalledTimes(1)
  })

  it('does not reload or re-save when a new session object arrives with the same user id (token refresh / tab refocus)', async () => {
    const { result, rerender } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ session: makeSession('user-1'), authMode: 'signin' })
    await Promise.resolve()
    await Promise.resolve()

    expect(loadUserTransactions).toHaveBeenCalledTimes(1)
    expect(saveUserPreferences).not.toHaveBeenCalled()
  })

  it('reloads when the user id changes (real user switch)', async () => {
    const { result, rerender } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ session: makeSession('user-2'), authMode: 'signin' })

    await waitFor(() => expect(loadUserTransactions).toHaveBeenCalledTimes(2))
  })

  it('reloads on refetch', async () => {
    const { result } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.refetch())

    await waitFor(() => expect(loadUserTransactions).toHaveBeenCalledTimes(2))
  })

  it('does not load anything while choosing a new password', async () => {
    renderWorkspace({ session: makeSession('user-1'), authMode: 'reset' })
    await Promise.resolve()

    expect(loadUserTransactions).not.toHaveBeenCalled()
  })

  it('saves when a preference value actually changes', async () => {
    const { result } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.setFxRate(42))

    expect(result.current.fxRate).toBe(42)
    expect(saveUserPreferences).toHaveBeenCalledTimes(1)
  })

  it('starts with the shared default categorization model before preferences load', () => {
    const { result } = renderWorkspace({ session: null, authMode: 'signin' })

    // Behavior unchanged: the default is still Haiku.
    expect(result.current.aiModel).toBe('claude-haiku-4-5')
  })
})
