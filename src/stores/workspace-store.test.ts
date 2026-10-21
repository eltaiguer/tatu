import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserPreferences } from '../services/supabase/user-preferences'
import type { Transaction } from '../models'

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../services/monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../services/monitoring/error-reporting')
  >()),
  captureError: reporting.captureError,
}))

import {
  DEFAULT_PREFERENCES,
  endSession,
  flushPreferenceSaves,
  hydrateWorkspace,
  PREFERENCE_FLUSH_TIMEOUT_MS,
  resetWorkspace,
  setPreference,
  teardownWorkspace,
  workspaceStore,
} from './workspace-store'
import { transactionStore } from './transaction-store'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'
import { getAiConfig } from '../services/ai/ai-config'
import { listMerchantCategoryOverrides } from '../services/categorizer/category-overrides'
import { listDescriptionOverrides } from '../services/descriptions/description-overrides'
import { listCustomPatterns } from '../services/categorizer/custom-patterns'
import { listCustomCategories } from '../services/categories/category-store'
import { UserFacingError } from '../utils/user-error'

function tx(id: string): Transaction {
  return {
    id,
    date: new Date('2026-03-01T00:00:00.000Z'),
    description: id,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'credit_card',
    category: 'restaurants',
    rawData: {},
  }
}

const A_PREFS: UserPreferences = {
  theme: 'dark',
  currency: 'UYU',
  fxRate: 42,
  claudeApiKey: 'sk-ant-a',
  aiEnabled: true,
  aiModel: 'claude-sonnet-4-5',
}

// One stored user: a row, one of each rule keyed on their id, and
// `preferences` (null: they never saved any).
function repoOf(
  userId: string,
  preferences: UserPreferences | null = null
): InMemoryRepository {
  return createInMemoryRepository({
    userId,
    transactions: [tx(`tx-${userId}`)],
    categoryOverrides: [
      {
        merchantNormalized: userId,
        merchantOriginal: userId,
        category: 'restaurants',
        createdAt: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    descriptionOverrides: [
      {
        descriptionNormalized: userId,
        descriptionOriginal: userId,
        friendlyDescription: `${userId} (friendly)`,
        createdAt: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
    customPatterns: [
      {
        id: `pattern-${userId}`,
        pattern: userId,
        matchType: 'contains',
        category: 'restaurants',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    customCategories: [
      {
        id: `cat-${userId}`,
        label: 'Mía',
        color: '#ff0000',
        isIgnored: false,
        isArchived: false,
        createdAt: '',
        updatedAt: '',
      },
    ],
    preferences,
  })
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

async function signIn(repo: InMemoryRepository) {
  await hydrateWorkspace(repo).done
}

// A request that waits for the test: `release()` lets it land.
function heldSave(repo: InMemoryRepository) {
  return repo.hold('savePreferences')
}

describe('workspace store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teardownWorkspace()
  })

  it('hydrates every piece of a user’s state, and teardown empties all of it', async () => {
    await signIn(repoOf('a', A_PREFS))

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
    await signIn(repoOf('a', A_PREFS))
    await signIn(repoOf('b'))

    expect(workspaceStore.getState().preferences).toEqual(DEFAULT_PREFERENCES)
    expect(getAiConfig()).toBeNull()
    expect(snapshot().transactions).toEqual(['tx-b'])
  })

  it('discards A’s load when it resolves after teardown', async () => {
    const a = repoOf('a', A_PREFS)
    const load = a.hold('load')
    const hydration = hydrateWorkspace(a)
    teardownWorkspace()

    load.release()
    await hydration.done

    expect(snapshot()).toEqual(EMPTY)
  })

  it('discards A’s load when it resolves after B’s', async () => {
    const a = repoOf('a', A_PREFS)
    const loadA = a.hold('load')
    const forA = hydrateWorkspace(a)
    const forB = hydrateWorkspace(repoOf('b'))

    await forB.done
    loadA.release()
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
    const a = repoOf('a', A_PREFS)
    const load = a.hold('load')
    const hydration = hydrateWorkspace(a)
    hydration.abandon()

    load.release()
    await hydration.done

    expect(snapshot().transactions).toEqual([])
    expect(workspaceStore.getState().status).toBe('loading')
  })

  it('reports a failed load without applying anything', async () => {
    const a = repoOf('a', A_PREFS)
    a.failOn('load', { error: new Error('offline') })

    await hydrateWorkspace(a).done

    expect(snapshot()).toEqual({ ...EMPTY, userId: 'a', status: 'error' })
    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      'workspace'
    )
  })

  describe('saving preferences', () => {
    it('never saves while the user’s own preferences are still loading', () => {
      const b = repoOf('b')
      b.hold('load')
      hydrateWorkspace(b)

      expect(setPreference('b', 'theme', 'dark')).toBe(false)
      expect(b.requests.savePreferences).toBeUndefined()
      expect(workspaceStore.getState().preferences.theme).toBe('auto')
    })

    it('never saves into another user’s row', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)

      expect(setPreference('b', 'theme', 'light')).toBe(false)
      expect(a.requests.savePreferences).toBeUndefined()
    })

    it('does not save just because preferences were loaded', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)

      expect(a.requests.savePreferences).toBeUndefined()
    })

    it('saves the loaded user’s full preferences on an edit, and updates the AI config', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)

      setPreference('a', 'claudeApiKey', 'sk-ant-a-2')
      await flushPreferenceSaves()

      expect(a.preferences).toEqual({ ...A_PREFS, claudeApiKey: 'sk-ant-a-2' })
      expect(getAiConfig()?.apiKey).toBe('sk-ant-a-2')
    })

    it('sends one save at a time, ending with the latest values', async () => {
      const a = repoOf('a')
      await signIn(a)
      const saved: string[] = []
      const save = a.savePreferences
      a.savePreferences = async (prefs) => {
        saved.push(prefs.claudeApiKey)
        await save(prefs)
      }
      const first = heldSave(a)

      setPreference('a', 'claudeApiKey', 'sk')
      setPreference('a', 'claudeApiKey', 'sk-a')
      setPreference('a', 'claudeApiKey', 'sk-an')
      expect(saved).toEqual(['sk'])

      first.release()
      await flushPreferenceSaves()

      expect(saved).toEqual(['sk', 'sk-an'])
      expect(a.preferences?.claudeApiKey).toBe('sk-an')
    })

    it('a reload waits for a pending save, so it reads the saved values instead of reverting them', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      const save = heldSave(a)
      setPreference('a', 'fxRate', 43)

      // Refetch (e.g. Transacciones' reload) while the save is in flight.
      const reload = hydrateWorkspace(a)
      await Promise.resolve()
      await Promise.resolve()
      expect(a.requests.load).toBe(1)

      save.release()
      await reload.done

      expect(a.requests.load).toBe(2)
      expect(workspaceStore.getState().preferences.fxRate).toBe(43)
      expect(workspaceStore.getState().status).toBe('ready')
    })

    it('stops waiting for a hung save after a bounded time', async () => {
      vi.useFakeTimers()
      try {
        const a = repoOf('a', A_PREFS)
        await signIn(a)
        heldSave(a)
        setPreference('a', 'fxRate', 43)

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
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      const save = heldSave(a)
      setPreference('a', 'fxRate', 43)
      setPreference('a', 'fxRate', 44)

      teardownWorkspace()
      save.release()
      await flushPreferenceSaves()
      await vi.waitFor(() => expect(a.preferences?.fxRate).toBe(43))

      expect(a.requests.savePreferences).toBe(1)
    })

    it('reports a failed save', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      a.failOn('savePreferences', { times: 1, error: new Error('boom') })

      setPreference('a', 'theme', 'light')
      await flushPreferenceSaves()

      expect(errorSpy).toHaveBeenCalledWith(
        'preferences save failed:',
        expect.any(Error)
      )
      expect(reporting.captureError).toHaveBeenCalledWith(
        expect.any(Error),
        'preferences'
      )
    })
  })

  describe('ending a session', () => {
    it('lets the last preference edit land, then signs out, then tears down', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      const save = heldSave(a)
      setPreference('a', 'fxRate', 43)
      const order: string[] = []

      const ended = endSession(async () => {
        order.push(`signOut (saved fxRate ${a.preferences?.fxRate})`)
      })
      save.release()
      await ended

      expect(order).toEqual(['signOut (saved fxRate 43)'])
      expect(snapshot()).toEqual(EMPTY)
    })

    it('still tears down when signing out fails (the stored session is gone), and rethrows', async () => {
      await signIn(repoOf('a', A_PREFS))

      await expect(
        endSession(() => Promise.reject(new Error('offline')))
      ).rejects.toThrow('offline')

      expect(snapshot()).toEqual(EMPTY)
    })

    it('leaves alone a user who signed in while the sign-out was in flight', async () => {
      await signIn(repoOf('a', A_PREFS))
      let finishSignOut: () => void = () => {}

      const ended = endSession(
        () => new Promise<void>((resolve) => (finishSignOut = resolve))
      )
      await vi.waitFor(() => expect(finishSignOut).not.toBe(undefined))
      await Promise.resolve()
      teardownWorkspace()
      await signIn(repoOf('b'))
      finishSignOut()
      await ended

      expect(snapshot()).toMatchObject({ userId: 'b', transactions: ['tx-b'] })
    })

    it('does not wait forever for a hung save', async () => {
      vi.useFakeTimers()
      try {
        const a = repoOf('a', A_PREFS)
        await signIn(a)
        heldSave(a)
        setPreference('a', 'fxRate', 43)
        const signOut = vi.fn(async () => {})

        const ended = endSession(signOut)
        await vi.advanceTimersByTimeAsync(PREFERENCE_FLUSH_TIMEOUT_MS)
        await ended

        expect(signOut).toHaveBeenCalled()
        expect(snapshot()).toEqual(EMPTY)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('resetting all data', () => {
    // What App passes: the workspace hook's refetch, which owns the reload.
    const reload = vi.fn()
    it('deletes everything on the server and starts the user over empty, ready, with saves allowed', async () => {
      reload.mockClear()
      const a = repoOf('a', A_PREFS)
      await signIn(a)

      await resetWorkspace(a, reload)

      expect(snapshot()).toEqual({ ...EMPTY, userId: 'a', status: 'ready' })
      expect(a.rows()).toEqual([])
      expect(a.preferences).toBeNull()
      expect(setPreference('a', 'theme', 'dark')).toBe(true)
      await flushPreferenceSaves()
      expect(a.preferences).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark' })
    })

    it('waits for a pending preference save, so it cannot recreate the deleted row', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      const save = heldSave(a)
      setPreference('a', 'fxRate', 43)

      const reset = resetWorkspace(a, reload)
      save.release()
      await reset

      expect(a.preferences).toBeNull()
    })

    it('on a partial failure, reloads what remains and explains it, carrying the cause', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      const failure = new Error('permission denied')
      a.failOn('resetAll', {
        when: ([table]) => table === 'custom_categories',
        error: failure,
      })

      const error = await resetWorkspace(a, reload).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(UserFacingError)
      expect((error as UserFacingError).message).toBe(
        'No se pudieron borrar todos los datos. Recargamos lo que quedó guardado; intentá de nuevo.'
      )
      expect((error as UserFacingError).cause).toBe(failure)
      expect(errorSpy).toHaveBeenCalledWith('reset failed:', failure)
      // The reload is the caller's (the hook clears stale messages and can
      // abandon it); the store does not load behind its back.
      expect(reload).toHaveBeenCalledTimes(1)
      await Promise.resolve()
      expect(a.requests.load).toBe(1)
    })

    it('does not reload for a user who is no longer loaded', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      a.failOn('resetAll')
      const deleting = a.hold('resetAll')

      const reset = resetWorkspace(a, reload).catch(() => {})
      await Promise.resolve()
      await signIn(repoOf('b'))
      deleting.release()
      await reset

      expect(reload).not.toHaveBeenCalled()
    })

    it('leaves the next user alone when the account changes during the reset', async () => {
      const a = repoOf('a', A_PREFS)
      await signIn(a)
      const deleting = a.hold('resetAll')

      const reset = resetWorkspace(a, reload)
      await Promise.resolve()
      await signIn(repoOf('b'))
      deleting.release()
      await reset

      expect(snapshot()).toMatchObject({
        userId: 'b',
        status: 'ready',
        transactions: ['tx-b'],
      })
    })
  })
})
