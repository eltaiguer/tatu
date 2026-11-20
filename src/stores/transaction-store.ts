import { createStore } from 'zustand/vanilla'
import type { Transaction } from '../models'
import { currentUserRules } from '../services/categorizer/user-rules'
import { inferInternalTransfers } from '../services/transfers/internal-transfers'

// Inference reads the user's rules at each write: a row a rule categorized
// is left alone (#289).
function infer(rows: Transaction[]): Transaction[] {
  return inferInternalTransfers(rows, currentUserRules())
}

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
  // Applies `fn` to the store's current rows at write time — not to a
  // snapshot read before an await — so concurrent mutations don't overwrite
  // each other's results.
  mapTransactions: (fn: (tx: Transaction) => Transaction) => void
  removeTransaction: (id: string) => void
  removeTransactions: (ids: string[]) => void
  clearTransactions: () => void
  setTransactions: (transactions: Transaction[]) => void
}

export type TransactionStore = TransactionStoreState & TransactionStoreActions

export function normalizeTransactions(
  transactions: Transaction[]
): Transaction[] {
  return infer(
    transactions.map((tx) => {
      const date =
        tx.date instanceof Date
          ? tx.date
          : new Date(tx.date as unknown as string)
      return { ...tx, date }
    })
  )
}

function createTransactionStoreState(
  set: (fn: (state: TransactionStoreState) => TransactionStoreState) => void
): TransactionStore {
  return {
    transactions: [],
    addTransaction: (transaction) =>
      set((state) => ({
        transactions: infer([...state.transactions, transaction]),
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

        return { transactions: infer(next) }
      })

      return { added, duplicates }
    },
    updateTransaction: (id, updates) =>
      set((state) => ({
        transactions: infer(
          state.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...updates } : tx
          )
        ),
      })),
    mapTransactions: (fn) =>
      set((state) => ({
        transactions: infer(state.transactions.map(fn)),
      })),
    removeTransaction: (id) =>
      set((state) => ({
        transactions: state.transactions.filter((tx) => tx.id !== id),
      })),
    removeTransactions: (ids) => {
      const idSet = new Set(ids)
      set((state) => ({
        transactions: infer(
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
  }
}

export function createTransactionStore() {
  return createStore<TransactionStore>()((set) =>
    createTransactionStoreState(set)
  )
}

export const transactionStore = createTransactionStore()
