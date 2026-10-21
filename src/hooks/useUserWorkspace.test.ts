import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { SupabaseSession } from '../services/supabase/client'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'
import { useUserWorkspace } from './useUserWorkspace'
import { teardownWorkspace } from '../stores/workspace-store'

function makeSession(userId: string): SupabaseSession {
  // New object identity each call — mirrors what Supabase hands us on refocus.
  return { user: { id: userId, email: 'jose@example.uy' } } as SupabaseSession
}

// Each user's stored data. App builds a new repository object per session
// object, so every rerender here does too.
let stored: Map<string, InMemoryRepository>
function repositoryFor(session: SupabaseSession | null) {
  if (!session) return null
  const id = session.user.id
  if (!stored.has(id)) stored.set(id, createInMemoryRepository({ userId: id }))
  const repo = stored.get(id)!
  return { ...repo }
}
const loads = (userId = 'user-1') => stored.get(userId)?.requests.load ?? 0
const saves = (userId = 'user-1') =>
  stored.get(userId)?.requests.savePreferences ?? 0

type Props = { session: SupabaseSession | null; authMode: 'signin' | 'reset' }

function renderWorkspace(initial: Props) {
  return renderHook(
    (p: Props) =>
      useUserWorkspace({ ...p, repository: repositoryFor(p.session) }),
    { initialProps: initial }
  )
}

describe('useUserWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stored = new Map()
    teardownWorkspace()
  })

  it('loads the signed-in user and reports ready', async () => {
    const { result } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(loads()).toBe(1)
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

    expect(loads()).toBe(1)
    expect(saves()).toBe(0)
  })

  it('reloads when the user id changes (real user switch)', async () => {
    const { result, rerender } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ session: makeSession('user-2'), authMode: 'signin' })

    await waitFor(() => expect(loads('user-2')).toBe(1))
  })

  it('reloads on refetch', async () => {
    const { result } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.refetch())

    await waitFor(() => expect(loads()).toBe(2))
  })

  it('does not load anything while choosing a new password', async () => {
    renderWorkspace({ session: makeSession('user-1'), authMode: 'reset' })
    await Promise.resolve()

    expect(loads()).toBe(0)
  })

  it('saves when a preference value actually changes', async () => {
    const { result } = renderWorkspace({
      session: makeSession('user-1'),
      authMode: 'signin',
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.setFxRate(42))

    expect(result.current.fxRate).toBe(42)
    await waitFor(() =>
      expect(stored.get('user-1')?.preferences?.fxRate).toBe(42)
    )
    expect(saves()).toBe(1)
  })

  it('starts with the shared default categorization model before preferences load', () => {
    const { result } = renderWorkspace({ session: null, authMode: 'signin' })

    expect(result.current.aiModel).toBe('claude-haiku-5-5')
  })
})
