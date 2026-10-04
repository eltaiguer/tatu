import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from '../services/supabase/client'
import type { UserPreferences } from '../services/supabase/user-preferences'
import type { Transaction } from '../models'

// One deferred load per user, so a test decides when (and in which order)
// each user's data arrives.
type Loaded = {
  transactions: Transaction[]
  merchant: string
  preferences: UserPreferences | null
}
const pending = new Map<
  string,
  { resolve: (v: Loaded) => void; reject: (e: Error) => void }
>()
const loads = new Map<string, Promise<Loaded>>()
function loadFor(session: SupabaseSession): Promise<Loaded> {
  const id = session.user.id
  if (!loads.has(id)) {
    loads.set(
      id,
      new Promise<Loaded>((resolve, reject) =>
        pending.set(id, { resolve, reject })
      )
    )
  }
  return loads.get(id)!
}

// The pending load for `id`, created on demand: a hydrate only starts
// loading after pending saves have flushed, a microtask later.
function deferred(id: string) {
  loadFor({ user: { id } } as SupabaseSession)
  return pending.get(id)!
}

const saveUserPreferences = vi.fn<
  [SupabaseSession, UserPreferences],
  Promise<void>
>(async () => {})

vi.mock('../services/supabase/transactions', () => ({
  loadUserTransactions: async (s: SupabaseSession) =>
    (await loadFor(s)).transactions,
}))
vi.mock('../services/supabase/category-overrides', () => ({
  listCategoryOverrides: async (s: SupabaseSession) => [
    {
      merchantNormalized: (await loadFor(s)).merchant,
      merchantOriginal: (await loadFor(s)).merchant,
      category: 'restaurants',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
}))
vi.mock('../services/supabase/description-overrides', () => ({
  listDescriptionOverrides: async (s: SupabaseSession) => [
    {
      descriptionNormalized: (await loadFor(s)).merchant,
      descriptionOriginal: (await loadFor(s)).merchant,
      friendlyDescription: `${(await loadFor(s)).merchant} (friendly)`,
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
}))
vi.mock('../services/supabase/custom-patterns', () => ({
  listCustomPatterns: async (s: SupabaseSession) => [
    {
      id: `pattern-${s.user.id}`,
      pattern: (await loadFor(s)).merchant,
      category: 'restaurants',
      isRegex: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
}))
vi.mock('../services/supabase/custom-categories', () => ({
  listCustomCategories: async (s: SupabaseSession) => {
    await loadFor(s)
    return [{ id: `cat-${s.user.id}`, label: 'Mía', color: '#ff0000' }]
  },
}))
vi.mock('../services/supabase/user-preferences', () => ({
  loadUserPreferences: async (s: SupabaseSession) =>
    (await loadFor(s)).preferences,
  saveUserPreferences: (s: SupabaseSession, p: UserPreferences) =>
    saveUserPreferences(s, p),
}))

import {
  DEFAULT_PREFERENCES,
  flushPreferenceSaves,
  hydrateWorkspace,
  PREFERENCE_FLUSH_TIMEOUT_MS,
  setPreference,
  startEmptyWorkspace,
  teardownWorkspace,
  workspaceStore,
} from './workspace-store'
import { transactionStore } from './transaction-store'
import { createInMemoryRepository } from '../services/repository/in-memory-repository'
import { getAiConfig } from '../services/ai/ai-config'
import { listMerchantCategoryOverrides } from '../services/categorizer/category-overrides'
import { listDescriptionOverrides } from '../services/descriptions/description-overrides'
import { listCustomPatterns } from '../services/categorizer/custom-patterns'
import { listCustomCategories } from '../services/categories/category-store'

function session(id: string): SupabaseSession {
  return { user: { id, email: `${id}@example.uy` } } as SupabaseSession
}

function tx(id: string): Transaction {
  return {
    id,
    date: new Date('2026-03-01'),
    description: id,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'credit_card',
    category: 'restaurants',
    rawData: {},
  } as Transaction
}

const A_PREFS: UserPreferences = {
  theme: 'dark',
  currency: 'UYU',
  fxRate: 42,
  claudeApiKey: 'sk-ant-a',
  aiEnabled: true,
  aiModel: 'claude-sonnet-4-5',
}

function dataOf(userId: string, preferences: UserPreferences | null) {
  return { transactions: [tx(`tx-${userId}`)], merchant: userId, preferences }
}

// Everything a user could have in memory, in one comparable snapshot.
function snapshot() {
  return {
    userId: workspaceStore.getState().userId,
    status: workspaceStore.getState().status,
    preferences: workspaceStore.getState().preferences,
    aiConfig: getAiConfig(),
    transactions: transactionStore.getState().transactions.map((t) => t.id),
    merchantOverrides: Object.keys(listMerchantCategoryOverrides()),
    descriptionOverrides: Object.keys(listDescriptionOverrides()),
    patterns: listCustomPatterns().map((p) => p.id),
    categories: listCustomCategories().map((c) => c.id),
  }
}

const EMPTY = {
  userId: null,
  status: 'idle',
  preferences: DEFAULT_PREFERENCES,
  aiConfig: null,
  transactions: [],
  merchantOverrides: [],
  descriptionOverrides: [],
  patterns: [],
  categories: [],
}

async function signIn(id: string, preferences: UserPreferences | null) {
  const hydration = hydrateWorkspace(session(id))
  deferred(id).resolve(dataOf(id, preferences))
  await hydration.done
}

describe('workspace store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pending.clear()
    loads.clear()
    teardownWorkspace()
  })

  it('loads through the repository port it is given (#119)', async () => {
    const repo = createInMemoryRepository({
      userId: 'user-r',
      transactions: [tx('tx-repo')],
      deleted: [tx('tx-gone')],
      customPatterns: [
        {
          id: 'cp-1',
          pattern: 'disco',
          matchType: 'contains',
          category: 'groceries',
          createdAt: '',
        },
      ],
      preferences: A_PREFS,
    })

    await hydrateWorkspace(session('user-r'), repo).done

    expect(snapshot()).toMatchObject({
      userId: 'user-r',
      status: 'ready',
      preferences: A_PREFS,
      transactions: ['tx-repo'],
      patterns: ['cp-1'],
    })
  })

  it('hydrates every piece of a user’s state, and teardown empties all of it', async () => {
    await signIn('a', A_PREFS)

    expect(snapshot()).toEqual({
      userId: 'a',
      status: 'ready',
      preferences: A_PREFS,
      aiConfig: {
        apiKey: 'sk-ant-a',
        enabled: true,
        model: 'claude-sonnet-4-5',
      },
      transactions: ['tx-a'],
      merchantOverrides: ['a'],
      descriptionOverrides: ['a'],
      patterns: ['pattern-a'],
      categories: ['cat-a'],
    })

    teardownWorkspace()

    expect(snapshot()).toEqual(EMPTY)
  })

  it('gives a user without a preferences row the defaults, not the previous user’s', async () => {
    await signIn('a', A_PREFS)
    await signIn('b', null)

    expect(workspaceStore.getState().preferences).toEqual(DEFAULT_PREFERENCES)
    expect(getAiConfig()).toBeNull()
    expect(snapshot().transactions).toEqual(['tx-b'])
  })

  it('discards A’s load when it resolves after teardown', async () => {
    const hydration = hydrateWorkspace(session('a'))
    teardownWorkspace()

    deferred('a').resolve(dataOf('a', A_PREFS))
    await hydration.done

    expect(snapshot()).toEqual(EMPTY)
  })

  it('discards A’s load when it resolves after B’s', async () => {
    const forA = hydrateWorkspace(session('a'))
    const forB = hydrateWorkspace(session('b'))

    deferred('b').resolve(dataOf('b', null))
    await forB.done
    deferred('a').resolve(dataOf('a', A_PREFS))
    await forA.done

    expect(snapshot()).toMatchObject({
      userId: 'b',
      status: 'ready',
      preferences: DEFAULT_PREFERENCES,
      aiConfig: null,
      transactions: ['tx-b'],
      merchantOverrides: ['b'],
      patterns: ['pattern-b'],
      categories: ['cat-b'],
    })
  })

  it('discards an abandoned load (an effect cleaned up before it landed)', async () => {
    const hydration = hydrateWorkspace(session('a'))
    hydration.abandon()

    deferred('a').resolve(dataOf('a', A_PREFS))
    await hydration.done

    expect(snapshot().transactions).toEqual([])
    expect(workspaceStore.getState().status).toBe('loading')
  })

  it('reports a failed load without applying anything', async () => {
    const hydration = hydrateWorkspace(session('a'))
    deferred('a').reject(new Error('offline'))
    await hydration.done

    expect(snapshot()).toEqual({ ...EMPTY, userId: 'a', status: 'error' })
  })

  describe('saving preferences', () => {
    it('never saves while the user’s own preferences are still loading', () => {
      hydrateWorkspace(session('b'))

      expect(setPreference(session('b'), 'theme', 'dark')).toBe(false)
      expect(saveUserPreferences).not.toHaveBeenCalled()
      expect(workspaceStore.getState().preferences.theme).toBe('auto')
    })

    it('never saves into another user’s row', async () => {
      await signIn('a', A_PREFS)

      expect(setPreference(session('b'), 'theme', 'light')).toBe(false)
      expect(saveUserPreferences).not.toHaveBeenCalled()
    })

    it('does not save just because preferences were loaded', async () => {
      await signIn('a', A_PREFS)

      expect(saveUserPreferences).not.toHaveBeenCalled()
    })

    it('saves the loaded user’s full preferences on an edit, and updates the AI config', async () => {
      await signIn('a', A_PREFS)

      setPreference(session('a'), 'claudeApiKey', 'sk-ant-a-2')
      await flushPreferenceSaves()

      expect(saveUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ id: 'a' }) }),
        { ...A_PREFS, claudeApiKey: 'sk-ant-a-2' }
      )
      expect(getAiConfig()?.apiKey).toBe('sk-ant-a-2')
    })

    it('sends one save at a time, ending with the latest values', async () => {
      await signIn('a', null)
      let release: () => void = () => {}
      saveUserPreferences.mockImplementationOnce(
        () => new Promise<void>((resolve) => (release = resolve))
      )

      setPreference(session('a'), 'claudeApiKey', 'sk')
      setPreference(session('a'), 'claudeApiKey', 'sk-a')
      setPreference(session('a'), 'claudeApiKey', 'sk-an')
      expect(saveUserPreferences).toHaveBeenCalledTimes(1)

      release()
      await flushPreferenceSaves()

      const keys = saveUserPreferences.mock.calls.map(([, p]) => p.claudeApiKey)
      expect(keys).toEqual(['sk', 'sk-an'])
    })

    it('a reload waits for a pending save, so it reads the saved values instead of reverting them', async () => {
      await signIn('a', A_PREFS)
      let release: () => void = () => {}
      saveUserPreferences.mockImplementationOnce(
        () => new Promise<void>((resolve) => (release = resolve))
      )
      setPreference(session('a'), 'fxRate', 43)

      // Refetch (e.g. Transacciones' reload) while the save is in flight.
      loads.delete('a')
      pending.delete('a')
      const reload = hydrateWorkspace(session('a'))
      await Promise.resolve()
      await Promise.resolve()
      expect(pending.has('a')).toBe(false)

      release()
      await vi.waitFor(() => expect(pending.has('a')).toBe(true))
      // The server row now has the saved value.
      deferred('a').resolve(dataOf('a', { ...A_PREFS, fxRate: 43 }))
      await reload.done

      expect(workspaceStore.getState().preferences.fxRate).toBe(43)
      expect(workspaceStore.getState().status).toBe('ready')
    })

    it('stops waiting for a hung save after a bounded time', async () => {
      vi.useFakeTimers()
      try {
        await signIn('a', A_PREFS)
        saveUserPreferences.mockImplementationOnce(
          () => new Promise<void>(() => {})
        )
        setPreference(session('a'), 'fxRate', 43)

        let flushed = false
        void flushPreferenceSaves().then(() => (flushed = true))
        await vi.advanceTimersByTimeAsync(PREFERENCE_FLUSH_TIMEOUT_MS - 1)
        expect(flushed).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        expect(flushed).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('drops a not-yet-sent save of a user who signs out', async () => {
      await signIn('a', A_PREFS)
      let release: () => void = () => {}
      saveUserPreferences.mockImplementationOnce(
        () => new Promise<void>((resolve) => (release = resolve))
      )
      setPreference(session('a'), 'fxRate', 43)
      setPreference(session('a'), 'fxRate', 44)

      teardownWorkspace()
      release()
      await flushPreferenceSaves()

      expect(saveUserPreferences).toHaveBeenCalledTimes(1)
    })

    it('reports a failed save', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await signIn('a', A_PREFS)
      saveUserPreferences.mockRejectedValueOnce(new Error('boom'))

      setPreference(session('a'), 'theme', 'light')
      await flushPreferenceSaves()

      expect(errorSpy).toHaveBeenCalledWith(
        'preferences save failed:',
        expect.any(Error)
      )
    })
  })

  it('starts a reset user over empty and ready, with saves allowed', async () => {
    await signIn('a', A_PREFS)

    startEmptyWorkspace(session('a'))

    expect(snapshot()).toEqual({ ...EMPTY, userId: 'a', status: 'ready' })
    expect(setPreference(session('a'), 'theme', 'dark')).toBe(true)
    await flushPreferenceSaves()
    expect(saveUserPreferences).toHaveBeenCalledWith(expect.anything(), {
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
    })
  })
})
