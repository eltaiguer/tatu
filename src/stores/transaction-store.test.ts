import { describe, it, expect, beforeEach } from 'vitest'
import { createTransactionStore } from './transaction-store'
import type { Transaction } from '../models'

function makeTransaction(id: string, overrides: Partial<Transaction> = {}) {
  const base: Transaction = {
    id,
    date: new Date('2025-01-01T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }

  return { ...base, ...overrides }
}

describe('Transaction Store - CRUD', () => {
  let store: ReturnType<typeof createTransactionStore>

  beforeEach(() => {
    store = createTransactionStore({ persist: false })
  })

  it('starts with no transactions', () => {
    expect(store.getState().transactions).toHaveLength(0)
  })

  it('adds a transaction', () => {
    const tx = makeTransaction('tx-1')
    store.getState().addTransaction(tx)

    expect(store.getState().transactions).toHaveLength(1)
    expect(store.getState().transactions[0].id).toBe('tx-1')
  })

  it('updates a transaction by id', () => {
    const tx = makeTransaction('tx-1')
    store.getState().addTransaction(tx)

    store.getState().updateTransaction('tx-1', {
      description: 'Updated',
      category: 'shopping',
    })

    const updated = store.getState().transactions[0]
    expect(updated.description).toBe('Updated')
    expect(updated.category).toBe('shopping')
  })

  it('removes a transaction by id', () => {
    store.getState().addTransaction(makeTransaction('tx-1'))
    store.getState().addTransaction(makeTransaction('tx-2'))

    store.getState().removeTransaction('tx-1')

    expect(store.getState().transactions).toHaveLength(1)
    expect(store.getState().transactions[0].id).toBe('tx-2')
  })

  it('clears all transactions', () => {
    store.getState().addTransaction(makeTransaction('tx-1'))
    store.getState().addTransaction(makeTransaction('tx-2'))

    store.getState().clearTransactions()

    expect(store.getState().transactions).toHaveLength(0)
  })

  it('replaces transactions with setTransactions', () => {
    store.getState().addTransaction(makeTransaction('tx-1'))

    const next = [makeTransaction('tx-2'), makeTransaction('tx-3')]
    store.getState().setTransactions(next)

    expect(store.getState().transactions).toHaveLength(2)
    expect(store.getState().transactions[0].id).toBe('tx-2')
  })
})

describe('Transaction Store - Duplicates and Merge', () => {
  let store: ReturnType<typeof createTransactionStore>

  beforeEach(() => {
    store = createTransactionStore({ persist: false })
  })

  it('detects duplicate ids against existing transactions', () => {
    store
      .getState()
      .setTransactions([makeTransaction('tx-1'), makeTransaction('tx-2')])

    const duplicates = store
      .getState()
      .findDuplicateIds([makeTransaction('tx-2'), makeTransaction('tx-3')])

    expect(duplicates).toEqual(['tx-2'])
  })

  it('merges new transactions without duplicating existing ones', () => {
    store
      .getState()
      .setTransactions([makeTransaction('tx-1'), makeTransaction('tx-2')])

    const result = store
      .getState()
      .mergeTransactions([makeTransaction('tx-2'), makeTransaction('tx-3')])

    expect(result.duplicates).toHaveLength(1)
    expect(result.added).toHaveLength(1)
    expect(store.getState().transactions.map((tx) => tx.id)).toEqual([
      'tx-1',
      'tx-2',
      'tx-3',
    ])
  })
})

describe('Transaction Store - Persistence', () => {
  const storageKey = 'tatu:test:transactions'
  let store: ReturnType<typeof createTransactionStore>

  beforeEach(() => {
    window.localStorage.clear()
    store = createTransactionStore({ persist: true, storageKey })
  })

  it('persists transactions to localStorage', () => {
    store.getState().addTransaction(makeTransaction('tx-1'))

    const raw = window.localStorage.getItem(storageKey)
    expect(raw).toBeTruthy()

    const parsed = JSON.parse(raw ?? '{}')
    expect(parsed.state.transactions).toHaveLength(1)
    expect(parsed.state.transactions[0].id).toBe('tx-1')
  })

  it('rehydrates transactions from localStorage', async () => {
    const stored = {
      state: {
        transactions: [
          {
            ...makeTransaction('tx-1'),
            date: '2025-01-02T00:00:00.000Z',
          },
        ],
      },
      version: 0,
    }
    window.localStorage.setItem(storageKey, JSON.stringify(stored))

    store = createTransactionStore({ persist: true, storageKey })
    const persisted = store as typeof store & {
      persist?: { rehydrate: () => Promise<void> }
    }
    await persisted.persist?.rehydrate()

    expect(store.getState().transactions).toHaveLength(1)
    expect(store.getState().transactions[0].id).toBe('tx-1')
    expect(store.getState().transactions[0].date).toBeInstanceOf(Date)
  })
})
