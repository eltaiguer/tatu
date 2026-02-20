import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Transaction } from '../models'

export const DEFAULT_TRANSACTION_STORAGE_KEY = 'tatu:transactions'

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
  clearTransactions: () => void
  setTransactions: (transactions: Transaction[]) => void
  findDuplicateIds: (transactions: Transaction[]) => string[]
  mergeTransactions: (transactions: Transaction[]) => {
    added: Transaction[]
    duplicates: Transaction[]
  }
}

export type TransactionStore = TransactionStoreState & TransactionStoreActions

interface TransactionStoreOptions {
  persist?: boolean
  storageKey?: string
}

function hasLocalStorage(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  )
}

function normalizeTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.map((tx) => {
    const date =
      tx.date instanceof Date ? tx.date : new Date(tx.date as unknown as string)
    return { ...tx, date }
  })
}

function createTransactionStoreState(
  set: (fn: (state: TransactionStoreState) => TransactionStoreState) => void,
  get: () => TransactionStoreState
): TransactionStore {
  return {
    transactions: [],
    addTransaction: (transaction) =>
      set((state) => ({
        transactions: [...state.transactions, transaction],
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

        return { transactions: next }
      })

      return { added, duplicates }
    },
    updateTransaction: (id, updates) =>
      set((state) => ({
        transactions: state.transactions.map((tx) =>
          tx.id === id ? { ...tx, ...updates } : tx
        ),
      })),
    removeTransaction: (id) =>
      set((state) => ({
        transactions: state.transactions.filter((tx) => tx.id !== id),
      })),
    clearTransactions: () =>
      set(() => ({
        transactions: [],
      })),
    setTransactions: (transactions) =>
      set(() => ({
        transactions,
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
    mergeTransactions: (transactions) => {
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

        return { transactions: next }
      })

      return { added, duplicates }
    },
  }
}

export function createTransactionStore(options: TransactionStoreOptions = {}) {
  const {
    persist: shouldPersist = true,
    storageKey = DEFAULT_TRANSACTION_STORAGE_KEY,
  } =
    options

  if (shouldPersist && hasLocalStorage()) {
    return createStore<TransactionStore>()(
      persist((set, get) => createTransactionStoreState(set, get), {
        name: storageKey,
        storage: createJSONStorage(() => window.localStorage),
        partialize: (state) => ({ transactions: state.transactions }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as
            | Partial<TransactionStoreState>
            | undefined

          return {
            ...currentState,
            ...persisted,
            transactions: normalizeTransactions(persisted?.transactions ?? []),
          }
        },
      })
    )
  }

  return createStore<TransactionStore>()((set, get) =>
    createTransactionStoreState(set, get)
  )
}

export const transactionStore = createTransactionStore()

export function getPersistedTransactionsSnapshot(
  storageKey: string = DEFAULT_TRANSACTION_STORAGE_KEY
): Transaction[] {
  if (!hasLocalStorage()) {
    return []
  }

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: { transactions?: Transaction[] }
    }
    return normalizeTransactions(parsed.state?.transactions ?? [])
  } catch {
    return []
  }
}
