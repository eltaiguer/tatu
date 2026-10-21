import { useRef } from 'react'
import type { Transaction } from '../models'
import {
  requireRepository,
  type Repository,
} from '../services/repository/repository'
import {
  applyPatternToPast,
  autoCategorize,
  bulkCategorize,
  bulkTag,
  deleteTransactions,
  editTransaction,
  importTransactions,
  restoreDeleted,
  splitTransaction,
  unsplitTransaction,
  type DeleteResult,
  type ImportContext,
  type ImportResult,
  type SplitPart,
  type TransactionEdit,
} from '../services/mutations/transaction-mutations'
import type { CustomPattern } from '../services/categorizer/custom-patterns'

export type { DeleteResult }

/**
 * The transaction mutations (`services/mutations/transaction-mutations.ts`)
 * bound to the signed-in user's repository. One contract: without a
 * repository (signed out) every handler rejects the same way. Handlers throw
 * on failure — a PartialWriteError when only some rows saved — and resolve
 * with what actually changed, so the UI only reports success that happened.
 */
export function useTransactionHandlers({
  repository,
  setError,
}: {
  repository: Repository | null
  setError: (msg: string) => void
}) {
  // Read when a handler runs, not when it was rendered: a toast's action can
  // fire after the session changed.
  const repositoryRef = useRef(repository)
  repositoryRef.current = repository

  function run<A extends unknown[], R>(
    mutation: (repo: Repository, ...args: A) => Promise<R>
  ) {
    return async (...args: A): Promise<R> => {
      const repo = requireRepository(repositoryRef.current)
      const result = await mutation(repo, ...args)
      setError('')
      return result
    }
  }

  return {
    handleTransactionsImported: run(
      (
        repo,
        transactions: Transaction[],
        context?: ImportContext
      ): Promise<ImportResult> =>
        importTransactions(repo, transactions, context)
    ),
    handleUpdateTransaction: run(
      (repo, transactionId: string, edit: TransactionEdit) =>
        editTransaction(repo, transactionId, edit)
    ),
    handleDeleteTransaction: run(
      (
        repo,
        transactionId: string,
        options: { allowIrreversible?: boolean } = {}
      ) => deleteTransactions(repo, [transactionId], options)
    ),
    handleBulkDeleteTransactions: run(
      (
        repo,
        transactionIds: string[],
        options: { allowIrreversible?: boolean } = {}
      ) => deleteTransactions(repo, transactionIds, options)
    ),
    // Undo runs with the repository that deleted the rows, never whoever is
    // signed in when the toast is clicked.
    handleRestoreTransactions: run((_repo, transactions: Transaction[]) =>
      restoreDeleted(transactions)
    ),
    handleSplitTransaction: run(
      (repo, transactionId: string, parts: SplitPart[]) =>
        splitTransaction(repo, transactionId, parts)
    ),
    handleUnsplitTransaction: run((repo, transactionId: string) =>
      unsplitTransaction(repo, transactionId)
    ),
    handleBulkCategorizeTransactions: run(
      (repo, transactionIds: string[], category: string) =>
        bulkCategorize(repo, transactionIds, category)
    ),
    handleBulkTagTransactions: run(
      (repo, transactionIds: string[], tag: string) =>
        bulkTag(repo, transactionIds, tag)
    ),
    handleAutoCategorizeTransactions: run((repo, transactionIds: string[]) =>
      autoCategorize(repo, transactionIds)
    ),
    handleApplyPatternToPast: run((repo, pattern: CustomPattern) =>
      applyPatternToPast(repo, pattern)
    ),
  }
}
