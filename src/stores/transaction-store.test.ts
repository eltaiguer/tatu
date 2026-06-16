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
    store = createTransactionStore()
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

describe('Transaction Store - Duplicates', () => {
  let store: ReturnType<typeof createTransactionStore>

  beforeEach(() => {
    store = createTransactionStore()
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

})

describe('Transaction Store - addTransactions', () => {
  let store: ReturnType<typeof createTransactionStore>

  beforeEach(() => {
    store = createTransactionStore()
  })

  it('adds all transactions when store is empty', () => {
    const result = store
      .getState()
      .addTransactions([makeTransaction('tx-1'), makeTransaction('tx-2')])

    expect(result.added).toHaveLength(2)
    expect(result.duplicates).toHaveLength(0)
    expect(store.getState().transactions).toHaveLength(2)
  })

  it('returns duplicates without re-adding them', () => {
    store.getState().addTransactions([makeTransaction('tx-1')])

    const result = store
      .getState()
      .addTransactions([makeTransaction('tx-1'), makeTransaction('tx-2')])

    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0].id).toBe('tx-1')
    expect(result.added).toHaveLength(1)
    expect(result.added[0].id).toBe('tx-2')
    expect(store.getState().transactions).toHaveLength(2)
    expect(store.getState().transactions.map((tx) => tx.id)).toEqual([
      'tx-1',
      'tx-2',
    ])
  })

  it('deduplicates within the same batch', () => {
    const result = store
      .getState()
      .addTransactions([makeTransaction('tx-1'), makeTransaction('tx-1')])

    expect(result.added).toHaveLength(1)
    expect(result.duplicates).toHaveLength(1)
    expect(store.getState().transactions).toHaveLength(1)
  })

  it('handles empty batch without errors', () => {
    const result = store.getState().addTransactions([])

    expect(result.added).toHaveLength(0)
    expect(result.duplicates).toHaveLength(0)
    expect(store.getState().transactions).toHaveLength(0)
  })

  it('infers internal transfers between matching bank transactions', () => {
    const debit = makeTransaction('tx-debit', {
      type: 'debit',
      source: 'bank_account',
      amount: 1000,
      currency: 'USD',
      description: 'pago tarjeta credito',
      date: new Date('2025-06-01T00:00:00.000Z'),
    })
    const credit = makeTransaction('tx-credit', {
      type: 'credit',
      source: 'bank_account',
      amount: 1000,
      currency: 'USD',
      description: 'pago tarjeta credito',
      date: new Date('2025-06-01T00:00:00.000Z'),
    })

    store.getState().addTransactions([debit, credit])

    const txs = store.getState().transactions
    expect(txs.find((tx) => tx.id === 'tx-debit')?.category).toBe('transfer')
    expect(txs.find((tx) => tx.id === 'tx-credit')?.category).toBe('transfer')
  })
})

describe('Transaction Store - setTransactions normalization', () => {
  let store: ReturnType<typeof createTransactionStore>

  beforeEach(() => {
    store = createTransactionStore()
  })

  it('normalizes string dates to Date objects', () => {
    const tx = makeTransaction('tx-1', {
      date: '2025-06-01' as unknown as Date,
    })

    store.getState().setTransactions([tx])

    const stored = store.getState().transactions[0]
    expect(stored.date).toBeInstanceOf(Date)
    expect(stored.date.toISOString()).toContain('2025-06-01')
  })

  it('keeps Date instances as-is', () => {
    const date = new Date('2025-06-01T00:00:00.000Z')
    const tx = makeTransaction('tx-1', { date })

    store.getState().setTransactions([tx])

    const stored = store.getState().transactions[0]
    expect(stored.date).toBeInstanceOf(Date)
    expect(stored.date.toISOString()).toBe(date.toISOString())
  })
})
