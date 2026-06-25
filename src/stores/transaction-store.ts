import { createStore } from 'zustand/vanilla'
import type { Transaction } from '../models'
import { inferInternalTransfers } from '../services/transfers/internal-transfers'

interface TransactionStoreState {
  transactions: Transaction[]
}

interface TransactionStoreActions {
  addTransaction: (transaction: Transaction) => void
  addTransactions: (transactions: Transaction[]) => {
    added: Transaction[]
    duplicates: Transaction[]
  }
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
  removeTransaction: (id: string) => void
  removeTransactions: (ids: string[]) => void
  clearTransactions: () => void
  setTransactions: (transactions: Transaction[]) => void
  findDuplicateIds: (transactions: Transaction[]) => string[]
}

export type TransactionStore = TransactionStoreState & TransactionStoreActions

export function normalizeTransactions(transactions: Transaction[]): Transaction[] {
  return inferInternalTransfers(
    transactions.map((tx) => {
      const date =
        tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string)
      return { ...tx, date }
    })
  )
}

function createTransactionStoreState(
  set: (fn: (state: TransactionStoreState) => TransactionStoreState) => void,
  get: () => TransactionStoreState
): TransactionStore {
  return {
    transactions: [],
    addTransaction: (transaction) =>
      set((state) => ({
        transactions: inferInternalTransfers([
          ...state.transactions,
          transaction,
        ]),
      })),
    addTransactions: (transactions) => {
      const added: Transaction[] = []
      const duplicates: Transaction[] = []

      set((state) => {
        const existingIds = new Set(state.transactions.map((tx) => tx.id))
        const next = [...state.transactions]

        transactions.forEach((tx) => {
          if (existingIds.has(tx.id)) {
            duplicates.push(tx)
          } else {
            existingIds.add(tx.id)
            added.push(tx)
            next.push(tx)
          }
        })

        return { transactions: inferInternalTransfers(next) }
      })

      return { added, duplicates }
    },
    updateTransaction: (id, updates) =>
      set((state) => ({
        transactions: inferInternalTransfers(
          state.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...updates } : tx
          )
        ),
      })),
    removeTransaction: (id) =>
      set((state) => ({
        transactions: state.transactions.filter((tx) => tx.id !== id),
      })),
    removeTransactions: (ids) => {
      const idSet = new Set(ids)
      set((state) => ({
        transactions: inferInternalTransfers(
          state.transactions.filter((tx) => !idSet.has(tx.id))
        ),
      }))
    },
    clearTransactions: () =>
      set(() => ({
        transactions: [],
      })),
    setTransactions: (transactions) =>
      set(() => ({
        transactions: normalizeTransactions(transactions),
      })),
    findDuplicateIds: (transactions) => {
      const existingIds = new Set(get().transactions.map((tx) => tx.id))
      const duplicates = new Set<string>()

      transactions.forEach((tx) => {
        if (existingIds.has(tx.id)) {
          duplicates.add(tx.id)
        }
      })

      return Array.from(duplicates)
    },
  }
}

export function createTransactionStore() {
  return createStore<TransactionStore>()((set, get) =>
    createTransactionStoreState(set, get)
  )
}

export const transactionStore = createTransactionStore()
