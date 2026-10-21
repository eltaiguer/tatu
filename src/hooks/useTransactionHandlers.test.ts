import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Transaction } from '../models'
import { useTransactionHandlers } from './useTransactionHandlers'
import { transactionStore } from '../stores/transaction-store'
import { workspaceStore } from '../stores/workspace-state'
import { replaceCustomPatterns } from '../services/categorizer/custom-patterns'
import { replaceDescriptionOverrides } from '../services/descriptions/description-overrides'
import { replaceMerchantCategoryOverrides } from '../services/categorizer/category-overrides'
import type { Repository } from '../services/repository/repository'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'

// Only what the hook adds on top of the mutations: binding the signed-in
// user's repository, passing each handler's arguments through and clearing
// the view's error. What each write does is tested at its own interface,
// services/mutations/transaction-mutations.test.ts.

const SIGNED_OUT =
  'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'

function makeTransaction(id: string, overrides: Partial<Transaction> = {}) {
  return {
    id,
    date: new Date('2026-03-15T00:00:00Z'),
    description: 'SUPERMERCADO DISCO',
    amount: 1200,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    categoryConfidence: 0.8,
    tags: [],
    rawData: {},
    ...overrides,
  } as Transaction
}

const parts = [
  { description: 'Comida', amount: 600, category: 'groceries' },
  { description: 'Bebida', amount: 600, category: 'restaurants' },
]

const rule = {
  id: 'r1',
  pattern: 'SUPERMERCADO',
  matchType: 'contains' as const,
  category: 'food',
  createdAt: '',
}

function signInAs(repo: InMemoryRepository, rows: Transaction[]) {
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
}

/** The hook, rendered for `repository`; rerender to change it. */
function renderHandlers(repository: Repository | null) {
  const setError = vi.fn()
  const view = renderHook(
    ({ repository }: { repository: Repository | null }) =>
      useTransactionHandlers({ repository, setError }),
    { initialProps: { repository } }
  )
  return { ...view, setError }
}

/** A signed-in user whose server and store hold row `a`. */
function signedIn() {
  const rows = [makeTransaction('a')]
  const repo = createInMemoryRepository({ transactions: rows })
  signInAs(repo, rows)
  return { repo, ...renderHandlers(repo) }
}

beforeEach(() => {
  transactionStore.getState().clearTransactions()
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
  replaceCustomPatterns([])
  workspaceStore.setState({ userId: null, status: 'idle' })
})

describe('useTransactionHandlers — one contract without a repository', () => {
  it('rejects every write the same way when nobody is signed in', async () => {
    const { result } = renderHook(() =>
      useTransactionHandlers({ repository: null, setError: vi.fn() })
    )
    const h = result.current
    const calls = [
      h.handleTransactionsImported([makeTransaction('a')]),
      h.handleUpdateTransaction('a', { applyScope: 'single' }),
      h.handleDeleteTransaction('a'),
      h.handleBulkDeleteTransactions(['a']),
      h.handleRestoreTransactions([makeTransaction('a')]),
      h.handleSplitTransaction('a', []),
      h.handleUnsplitTransaction('a'),
      h.handleBulkCategorizeTransactions(['a'], 'food'),
      h.handleBulkTagTransactions(['a'], 'x'),
      h.handleAutoCategorizeTransactions(['a']),
      h.handleApplyPatternToPast({
        id: 'r',
        pattern: 'x',
        matchType: 'contains',
        category: 'food',
        createdAt: '',
      }),
    ]
    for (const call of calls) {
      await expect(call).rejects.toThrow(SIGNED_OUT)
    }
  })

  it('rejects a handler from an earlier render once the user signed out', async () => {
    const { result, rerender } = signedIn()
    const tagFromEarlierRender = result.current.handleBulkTagTransactions

    rerender({ repository: null })

    await expect(tagFromEarlierRender(['a'], 'viaje')).rejects.toThrow(
      SIGNED_OUT
    )
  })
})

describe('useTransactionHandlers — the view error', () => {
  it('clears the error after a write succeeds, and leaves it after one fails', async () => {
    const { repo, result, setError } = signedIn()

    repo.failOn('update', { error: new Error('timeout'), times: 1 })
    await expect(
      result.current.handleBulkTagTransactions(['a'], 'viaje')
    ).rejects.toThrow()
    expect(setError).not.toHaveBeenCalled()

    await result.current.handleBulkTagTransactions(['a'], 'viaje')
    expect(setError).toHaveBeenCalledWith('')
  })

  type Handlers = ReturnType<typeof useTransactionHandlers>
  const writes: Array<
    [
      keyof Handlers,
      {
        prepare?: (h: Handlers) => Promise<unknown>
        write: (h: Handlers, prepared: unknown) => Promise<unknown>
      },
    ]
  > = [
    [
      'handleTransactionsImported',
      { write: (h) => h.handleTransactionsImported([makeTransaction('b')]) },
    ],
    [
      'handleUpdateTransaction',
      {
        write: (h) =>
          h.handleUpdateTransaction('a', {
            category: 'food',
            applyScope: 'single',
          }),
      },
    ],
    [
      'handleDeleteTransaction',
      { write: (h) => h.handleDeleteTransaction('a') },
    ],
    [
      'handleBulkDeleteTransactions',
      { write: (h) => h.handleBulkDeleteTransactions(['a']) },
    ],
    [
      'handleRestoreTransactions',
      {
        prepare: (h) => h.handleBulkDeleteTransactions(['a']),
        write: (h, deleted) =>
          h.handleRestoreTransactions(
            (deleted as { removed: Transaction[] }).removed
          ),
      },
    ],
    [
      'handleSplitTransaction',
      { write: (h) => h.handleSplitTransaction('a', parts) },
    ],
    [
      'handleUnsplitTransaction',
      {
        prepare: (h) => h.handleSplitTransaction('a', parts),
        write: (h) => h.handleUnsplitTransaction('a'),
      },
    ],
    [
      'handleBulkCategorizeTransactions',
      { write: (h) => h.handleBulkCategorizeTransactions(['a'], 'food') },
    ],
    [
      'handleBulkTagTransactions',
      { write: (h) => h.handleBulkTagTransactions(['a'], 'viaje') },
    ],
    [
      'handleAutoCategorizeTransactions',
      { write: (h) => h.handleAutoCategorizeTransactions(['a']) },
    ],
    [
      'handleApplyPatternToPast',
      { write: (h) => h.handleApplyPatternToPast(rule) },
    ],
  ]

  it('covers every handler', () => {
    const { result } = renderHandlers(null)
    expect(writes.map(([name]) => name).sort()).toEqual(
      Object.keys(result.current).sort()
    )
  })

  it.each(writes)(
    '%s clears the error after it succeeds',
    async (_name, { prepare, write }) => {
      const { result, setError } = signedIn()
      const prepared = await prepare?.(result.current)
      setError.mockClear()

      await write(result.current, prepared)

      expect(setError).toHaveBeenCalledWith('')
    }
  )
})

describe('useTransactionHandlers — arguments reach the mutation', () => {
  it.each(['handleDeleteTransaction', 'handleBulkDeleteTransactions'] as const)(
    '%s passes the confirmation for an irreversible delete',
    async (handler) => {
      const { repo, result } = signedIn()
      await result.current.handleSplitTransaction('a', parts)

      const removed = await (handler === 'handleDeleteTransaction'
        ? result.current.handleDeleteTransaction('a', {
            allowIrreversible: true,
          })
        : result.current.handleBulkDeleteTransactions(['a'], {
            allowIrreversible: true,
          }))

      expect(removed.reversible).toBe(false)
      expect(repo.isDeleted('a')).toBe(true)
    }
  )

  it('passes the import context, so the import run is recorded', async () => {
    const { repo, result } = signedIn()

    await result.current.handleTransactionsImported([makeTransaction('b')], {
      parsedData: { fileType: 'bank_account_uyu' },
      csvContent: 'raw,csv',
      fileName: 'movements.csv',
    })

    expect(repo.importRuns).toHaveLength(1)
    expect(repo.importRuns[0]).toMatchObject({
      fileName: 'movements.csv',
      status: 'completed',
    })
  })
})

describe('useTransactionHandlers — the current repository', () => {
  it('writes with the repository of the latest render, even from an older handler', async () => {
    const repoA = createInMemoryRepository({
      userId: 'user-a',
      transactions: [makeTransaction('a')],
    })
    const repoB = createInMemoryRepository({
      userId: 'user-b',
      transactions: [makeTransaction('a')],
    })
    signInAs(repoA, [makeTransaction('a')])
    const { result, rerender } = renderHandlers(repoA)
    // e.g. a toast's action, rendered while A was signed in.
    const tagFromEarlierRender = result.current.handleBulkTagTransactions

    signInAs(repoB, [makeTransaction('a')])
    rerender({ repository: repoB })
    await tagFromEarlierRender(['a'], 'viaje')

    expect(repoB.row('a')?.tags).toEqual(['viaje'])
    expect(repoA.row('a')?.tags).toEqual([])
  })

  it('restores through the repository that did the delete, after the current one changed', async () => {
    const { repo: deletedWith, result, rerender } = signedIn()
    const { removed } = await result.current.handleBulkDeleteTransactions(['a'])
    // Same user, new repository (e.g. a refreshed session).
    const current = createInMemoryRepository({
      deleted: [makeTransaction('a')],
    })
    rerender({ repository: current })

    await result.current.handleRestoreTransactions(removed)

    expect(deletedWith.isDeleted('a')).toBe(false)
    expect(current.requests.restore).toBeUndefined()
  })
})
