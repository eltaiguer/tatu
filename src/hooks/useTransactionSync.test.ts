import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { SupabaseSession } from '../services/supabase/client'

// Supabase loaders — resolve with empty payloads; we only assert call counts.
const loadUserTransactions = vi.fn(async () => [])
const listCategoryOverrides = vi.fn(async () => [])
const listRemoteDescriptionOverrides = vi.fn(async () => [])
const listSupabaseCustomPatterns = vi.fn(async () => [])
const listCustomCategories = vi.fn(async () => [])
const loadUserPreferences = vi.fn(async () => null)

vi.mock('../services/supabase/transactions', () => ({
  loadUserTransactions: () => loadUserTransactions(),
}))
vi.mock('../services/supabase/category-overrides', () => ({
  listCategoryOverrides: () => listCategoryOverrides(),
}))
vi.mock('../services/supabase/description-overrides', () => ({
  listDescriptionOverrides: () => listRemoteDescriptionOverrides(),
}))
vi.mock('../services/supabase/custom-patterns', () => ({
  listCustomPatterns: () => listSupabaseCustomPatterns(),
}))
vi.mock('../services/supabase/custom-categories', () => ({
  listCustomCategories: () => listCustomCategories(),
}))
vi.mock('../services/supabase/user-preferences', () => ({
  loadUserPreferences: () => loadUserPreferences(),
}))

// Store-replacement side effects — stubbed so the test stays focused on sync.
vi.mock('../services/categorizer/category-overrides', () => ({
  replaceMerchantCategoryOverrides: vi.fn(),
}))
vi.mock('../services/descriptions/description-overrides', () => ({
  replaceDescriptionOverrides: vi.fn(),
}))
vi.mock('../services/categories/category-store', () => ({
  replaceCustomCategories: vi.fn(),
}))
vi.mock('../services/categorizer/custom-patterns', () => ({
  replaceCustomPatterns: vi.fn(),
}))

import { useTransactionSync } from './useTransactionSync'

function makeSession(userId: string): SupabaseSession {
  // New object identity each call — mirrors what Supabase hands us on refocus.
  return { user: { id: userId, email: 'jose@example.uy' } } as SupabaseSession
}

function makeProps(session: SupabaseSession | null) {
  return {
    session,
    authMode: 'signin' as const,
    syncKey: 0,
    markPrefsLoaded: vi.fn(),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSyncStatus: vi.fn(),
    setTheme: vi.fn(),
    setPreferredCurrency: vi.fn(),
    setFxRate: vi.fn(),
    setClaudeApiKey: vi.fn(),
    setAiEnabled: vi.fn(),
    setAiModel: vi.fn(),
  }
}

describe('useTransactionSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not refetch when a new session object arrives with the same user id (token refresh / tab refocus)', async () => {
    const props = makeProps(makeSession('user-1'))
    const { rerender } = renderHook((p) => useTransactionSync(p), {
      initialProps: props,
    })

    await waitFor(() => expect(loadUserTransactions).toHaveBeenCalledTimes(1))

    // Simulate Supabase emitting TOKEN_REFRESHED on refocus: a brand-new
    // session object with an identical user id.
    rerender({ ...props, session: makeSession('user-1') })

    // Give any (unwanted) re-run a chance to fire before asserting.
    await Promise.resolve()
    await Promise.resolve()

    expect(loadUserTransactions).toHaveBeenCalledTimes(1)
  })

  it('refetches when the user id changes (real user switch)', async () => {
    const props = makeProps(makeSession('user-1'))
    const { rerender } = renderHook((p) => useTransactionSync(p), {
      initialProps: props,
    })

    await waitFor(() => expect(loadUserTransactions).toHaveBeenCalledTimes(1))

    rerender({ ...props, session: makeSession('user-2') })

    await waitFor(() => expect(loadUserTransactions).toHaveBeenCalledTimes(2))
  })
})
