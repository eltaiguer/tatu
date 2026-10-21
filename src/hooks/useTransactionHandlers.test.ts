import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Transaction } from '../models'
import { useTransactionHandlers } from './useTransactionHandlers'
import { transactionStore } from '../stores/transaction-store'
import { workspaceStore } from '../stores/workspace-state'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'

// Only what the hook adds on top of the mutations: binding the signed-in
// user's repository and clearing the view's error. What each write does is
// tested at its own interface, services/mutations/transaction-mutations.test.ts.

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

function signInAs(repo: InMemoryRepository, rows: Transaction[]) {
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
}

beforeEach(() => {
  transactionStore.getState().clearTransactions()
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
      await expect(call).rejects.toThrow(
        'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
      )
    }
  })
})

describe('useTransactionHandlers — the view error', () => {
  it('clears the error after a write succeeds, and leaves it after one fails', async () => {
    const rows = [makeTransaction('a')]
    const repo = createInMemoryRepository({ transactions: rows })
    signInAs(repo, rows)
    const setError = vi.fn()
    const { result } = renderHook(() =>
      useTransactionHandlers({ repository: repo, setError })
    )

    repo.failOn('update', { error: new Error('timeout'), times: 1 })
    await expect(
      result.current.handleBulkTagTransactions(['a'], 'viaje')
    ).rejects.toThrow()
    expect(setError).not.toHaveBeenCalled()

    await result.current.handleBulkTagTransactions(['a'], 'viaje')
    expect(setError).toHaveBeenCalledWith('')
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
    const { result, rerender } = renderHook(
      ({ repository }) =>
        useTransactionHandlers({ repository, setError: vi.fn() }),
      { initialProps: { repository: repoA } }
    )
    // e.g. a toast's action, rendered while A was signed in.
    const tagFromEarlierRender = result.current.handleBulkTagTransactions

    signInAs(repoB, [makeTransaction('a')])
    rerender({ repository: repoB })
    await tagFromEarlierRender(['a'], 'viaje')

    expect(repoB.row('a')?.tags).toEqual(['viaje'])
    expect(repoA.row('a')?.tags).toEqual([])
  })
})
