import { useRef } from 'react'
import type { SupabaseSession } from '../services/supabase/client'
import type { Transaction } from '../models'
import { transactionStore } from '../stores/transaction-store'
import {
  persistTransactions,
  softDeleteTransaction,
  restoreTransactions,
  updateTransaction as updateRemoteTransaction,
  splitTransaction as remoteSplitTransaction,
  unsplitTransaction as remoteUnsplitTransaction,
  hardDeleteTransactions,
  type SplitPart,
} from '../services/supabase/transactions'
import {
  listMerchantCategoryOverrides,
  clearMerchantCategoryOverrideWithSync,
  setMerchantCategoryOverrideWithSync,
  getMerchantCategoryOverride,
} from '../services/categorizer/category-overrides'
import {
  clearDescriptionOverrideWithSync,
  setDescriptionOverrideWithSync,
  getDescriptionOverride,
} from '../services/descriptions/description-overrides'
import {
  countSimilarEditReach,
  findSimilarTransactions,
} from '../services/descriptions/similar-transactions'
import {
  completeImportRun,
  createImportRun,
  failImportRun,
  sha256Hex,
} from '../services/supabase/import-runs'
import {
  categorizeTransaction,
  type CategorizationContext,
} from '../services/categorizer/transaction-categorizer'
import { analyzeTemporalPatterns } from '../services/categorizer/temporal-patterns'
import { normalizeMerchantName } from '../services/categorizer/merchant-patterns'
import {
  testPattern,
  type CustomPattern,
} from '../services/categorizer/custom-patterns'

import {
  getAiConfig,
  enrichTransactionsWithAi,
  applyAiEnrichment,
} from '../services/ai'
import { buildCorrectionContext } from '../services/ai/correction-context'
import { NeedsConfirmationError, UserFacingError } from '../utils/user-error'

const MISSING_TRANSACTION = new UserFacingError(
  'La transacción ya no existe. Recargá para ver el estado actual.'
)

// Deleting a split row can't be undone: a parent's parts are hard-deleted, and
// a soft-deleted part would collide with a later re-split's deterministic ids.
function isSplitRow(tx: Transaction): boolean {
  return Boolean(tx.isSplitParent || tx.splitParentId)
}

export interface DeleteResult {
  removed: Transaction[]
  // False when the delete hard-removed data, so no undo can be offered.
  reversible: boolean
}

// Mutation handlers throw on failure (and on no-op preconditions) and return
// what actually changed, so the UI only reports success that happened. They
// write through the store's functional actions, never a snapshot taken before
// an await, so concurrent mutations don't overwrite each other.
export function useTransactionHandlers({
  session,
  setError,
}: {
  session: SupabaseSession | null
  setError: (msg: string) => void
}) {
  // Undo runs from a toast after this render; it must use the session that
  // is current then (or none, after sign-out), not the one captured now.
  const sessionRef = useRef(session)
  sessionRef.current = session

  /**
   * Imports a parsed statement. AI enrichment is best-effort: if it fails the
   * import still completes with the rule-based categories, but the reason is
   * returned as `aiError` so the caller can tell the user the AI step did not
   * run. Swallowing it silently makes an expired API key indistinguishable
   * from the model simply categorizing badly.
   */
  async function handleTransactionsImported(
    transactionsToImport: Transaction[],
    context?: {
      parsedData: {
        fileType: 'credit_card' | 'bank_account_usd' | 'bank_account_uyu'
      }
      csvContent: string
      fileName: string
    }
  ): Promise<{
    added: Transaction[]
    duplicates: Transaction[]
    /** Enrichment did not run at all. */
    aiError?: string
    /** Enrichment ran but some batches failed; the rest were applied. */
    aiPartial?: string
  }> {
    if (!session) {
      return transactionStore.getState().addTransactions(transactionsToImport)
    }

    let importRunId: string | null = null
    if (context) {
      const fileChecksum = await sha256Hex(context.csvContent)
      importRunId = await createImportRun(session, {
        fileName: context.fileName,
        fileType: context.parsedData.fileType,
        fileChecksum,
      })
    }

    const state = transactionStore.getState()
    const duplicateIds = new Set(state.findDuplicateIds(transactionsToImport))
    const added = transactionsToImport.filter((tx) => !duplicateIds.has(tx.id))
    const duplicates = transactionsToImport.filter((tx) =>
      duplicateIds.has(tx.id)
    )

    const aiConfig = getAiConfig()
    let toStore = added
    let aiError: string | undefined
    let aiPartial: string | undefined

    if (aiConfig?.enabled && aiConfig.apiKey && added.length > 0) {
      const toEnrich = added.filter((tx) => {
        const hasDescOverride = !!getDescriptionOverride(tx.description)
        const hasCatOverride = !!getMerchantCategoryOverride(
          normalizeMerchantName(tx.description)
        )
        return !hasDescOverride && !hasCatOverride
      })

      if (toEnrich.length > 0) {
        try {
          const correctionContext = buildCorrectionContext()
          const { results, partialFailure } = await enrichTransactionsWithAi(
            toEnrich.map((tx) => ({
              id: tx.id,
              description: tx.description,
              type: tx.type,
              amount: tx.amount,
              currency: tx.currency,
              source: tx.source,
            })),
            aiConfig,
            correctionContext
          )
          toStore = applyAiEnrichment(added, results)
          // Some batches succeeded and some did not — keep what we got, but
          // still tell the user the enrichment was incomplete.
          aiPartial = partialFailure
        } catch (error) {
          // Fall through with the rule-based results already on the
          // transactions, but keep the reason so it can be surfaced.
          aiError =
            error instanceof Error ? error.message : 'Error desconocido de IA'
          console.error('AI enrichment failed during import:', error)
        }
      }
    }

    try {
      await persistTransactions(session, toStore, {
        importId: importRunId ?? undefined,
      })
      state.addTransactions(toStore)
    } catch (error) {
      if (importRunId) {
        await failImportRun(
          session,
          importRunId,
          error instanceof Error ? error.message : 'Error de importación'
        )
      }
      throw error
    }

    // The rows are already saved and visible; failing to close the audit
    // record must not report the import itself as failed.
    if (importRunId) {
      try {
        await completeImportRun(session, importRunId, {
          totalRows: transactionsToImport.length,
          insertedRows: added.length,
          duplicateRows: duplicates.length,
        })
      } catch (error) {
        console.error('Could not complete import run record:', error)
      }
    }

    return { added, duplicates, aiError, aiPartial }
  }

  async function handleUpdateTransaction(
    transactionId: string,
    updates: {
      displayDescription?: string
      category?: string
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ): Promise<{ affected: number }> {
    const state = transactionStore.getState()
    const current = state.transactions.find((tx) => tx.id === transactionId)
    if (!current) {
      throw MISSING_TRANSACTION
    }

    const trimmedDisplayDescription = updates.displayDescription?.trim()
    const renamed =
      !!trimmedDisplayDescription &&
      trimmedDisplayDescription !== current.description
    const nextCategory = updates.category?.trim() || undefined
    const nextTags = updates.tags

    async function writeOverrides(current: Transaction) {
      if (renamed) {
        await setDescriptionOverrideWithSync({
          description: current.description,
          friendlyDescription: trimmedDisplayDescription!,
          category: nextCategory,
        })
      } else {
        await clearDescriptionOverrideWithSync(current.description)
      }

      if (nextCategory) {
        await setMerchantCategoryOverrideWithSync(
          current.description,
          nextCategory
        )
      } else {
        await clearMerchantCategoryOverrideWithSync(current.description)
      }
    }

    if (updates.applyScope === 'matching_past_and_future') {
      // When the user renamed, a merchant-keyed description override is
      // written and becomes the single source of the friendly name — so the
      // per-row values must be cleared, or rows keep disagreeing. When they
      // did not, clearing would destroy per-row values (e.g. AI-enriched
      // ones) that nothing else supplies.
      const matching = findSimilarTransactions(state.transactions, current)
      const matchingIds = new Set(matching.map((tx) => tx.id))

      await writeOverrides(current)

      if (session) {
        await Promise.all(
          matching.map((tx) =>
            updateRemoteTransaction(session, tx.id, {
              category: nextCategory,
              ...(nextCategory !== undefined && { categoryConfidence: 1 }),
              // null clears the column; omitting the key leaves it alone.
              ...(renamed && { displayDescription: null }),
            })
          )
        )

        if (nextTags !== undefined) {
          await updateRemoteTransaction(session, transactionId, {
            tags: nextTags,
          })
        }
      }

      // Same id set as the remote writes above, so local and server agree.
      transactionStore.getState().mapTransactions((tx) => {
        if (!matchingIds.has(tx.id)) {
          return tx
        }
        return {
          ...tx,
          ...(nextCategory && {
            category: nextCategory,
            categoryConfidence: 1 as const,
          }),
          ...(tx.id === transactionId &&
            nextTags !== undefined && { tags: nextTags }),
          ...(renamed && { displayDescription: undefined }),
        }
      })
      setError('')
      return {
        affected: countSimilarEditReach(state.transactions, current, renamed),
      }
    }

    if (updates.applyScope === 'future_matching_only') {
      await writeOverrides(current)

      if (session) {
        await updateRemoteTransaction(session, transactionId, {
          // null, not undefined, when the name is being reset: undefined
          // omits the column and the old value survives on the server
          // while the local store clears it (see UpdateTransactionInput).
          displayDescription: renamed ? trimmedDisplayDescription : null,
          category: nextCategory,
          ...(nextCategory !== undefined && { categoryConfidence: 1 }),
          tags: nextTags,
        })
      }

      transactionStore.getState().updateTransaction(transactionId, {
        displayDescription: renamed ? trimmedDisplayDescription : undefined,
        category: nextCategory,
        ...(nextCategory !== undefined && { categoryConfidence: 1 }),
        tags: nextTags,
      })
      setError('')
      return { affected: 1 }
    }

    const singleDisplayDescription = renamed
      ? trimmedDisplayDescription
      : undefined

    if (session) {
      await updateRemoteTransaction(session, transactionId, {
        // null, not undefined — see the note on UpdateTransactionInput.
        displayDescription: singleDisplayDescription ?? null,
        category: nextCategory,
        ...(nextCategory !== undefined && { categoryConfidence: 1 }),
        tags: nextTags,
      })
    }

    transactionStore.getState().updateTransaction(transactionId, {
      displayDescription: singleDisplayDescription,
      category: nextCategory,
      ...(nextCategory !== undefined && { categoryConfidence: 1 }),
      tags: nextTags,
    })
    setError('')
    return { affected: 1 }
  }

  // Split parts (the targets' own, and those of any split parent among them)
  // are hard-deleted: their ids are deterministic, so a soft-deleted part
  // would come back invisible after a later re-split. Everything else is
  // soft-deleted. Then all of them leave the store.
  async function deleteRows(targets: Transaction[]): Promise<DeleteResult> {
    const all = transactionStore.getState().transactions
    const parentIds = new Set(
      targets.filter((tx) => tx.isSplitParent).map((tx) => tx.id)
    )
    const hardIds = [
      ...all
        .filter((tx) => tx.splitParentId && parentIds.has(tx.splitParentId))
        .map((tx) => tx.id),
      ...targets.filter((tx) => tx.splitParentId).map((tx) => tx.id),
    ]
    const hardSet = new Set(hardIds)
    const softTargets = targets.filter((tx) => !hardSet.has(tx.id))

    if (session) {
      if (hardIds.length > 0) {
        await hardDeleteTransactions(session, hardIds)
      }
      await Promise.all(
        softTargets.map((tx) => softDeleteTransaction(session, tx.id))
      )
    }

    transactionStore
      .getState()
      .removeTransactions([...targets.map((tx) => tx.id), ...hardIds])
    setError('')
    return { removed: targets, reversible: !targets.some(isSplitRow) }
  }

  // Throws NeedsConfirmationError before writing anything when the delete
  // can't be undone and the caller hasn't confirmed it.
  async function handleDeleteTransaction(
    transactionId: string,
    options: { allowIrreversible?: boolean } = {}
  ): Promise<DeleteResult> {
    const tx = transactionStore
      .getState()
      .transactions.find((t) => t.id === transactionId)
    if (!tx) {
      throw MISSING_TRANSACTION
    }
    if (isSplitRow(tx) && !options.allowIrreversible) {
      throw new NeedsConfirmationError()
    }
    return deleteRows([tx])
  }

  async function handleBulkDeleteTransactions(
    transactionIds: string[],
    options: { allowIrreversible?: boolean } = {}
  ): Promise<DeleteResult> {
    if (transactionIds.length === 0) {
      return { removed: [], reversible: true }
    }
    const ids = new Set(transactionIds)
    const targets = transactionStore
      .getState()
      .transactions.filter((tx) => ids.has(tx.id))
    if (targets.length === 0) {
      throw MISSING_TRANSACTION
    }
    if (targets.some(isSplitRow) && !options.allowIrreversible) {
      throw new NeedsConfirmationError()
    }
    return deleteRows(targets)
  }

  // Undo for a reversible delete: one remote request for all rows, then put
  // them back in the store (rows already present — e.g. re-imported in the
  // meantime — are left as they are).
  async function handleRestoreTransactions(
    transactions: Transaction[]
  ): Promise<{ restored: number }> {
    const currentSession = sessionRef.current
    if (!currentSession) {
      throw new UserFacingError(
        'Tu sesión terminó; iniciá sesión de nuevo para deshacer.'
      )
    }
    await restoreTransactions(
      currentSession,
      transactions.map((tx) => tx.id)
    )
    transactionStore.getState().addTransactions(transactions)
    setError('')
    return { restored: transactions.length }
  }

  async function handleSplitTransaction(
    transactionId: string,
    parts: SplitPart[]
  ): Promise<{ parts: number }> {
    const parent = transactionStore
      .getState()
      .transactions.find((tx) => tx.id === transactionId)
    if (!parent) {
      throw MISSING_TRANSACTION
    }
    if (!session) {
      throw new UserFacingError('Iniciá sesión para dividir transacciones.')
    }

    const { parent: updatedParent, children } = await remoteSplitTransaction(
      session,
      parent,
      parts
    )
    const store = transactionStore.getState()
    store.updateTransaction(updatedParent.id, updatedParent)
    store.addTransactions(children)
    setError('')
    return { parts: children.length }
  }

  async function handleUnsplitTransaction(transactionId: string) {
    const state = transactionStore.getState()
    const parent = state.transactions.find((tx) => tx.id === transactionId)
    if (!parent) {
      throw MISSING_TRANSACTION
    }
    if (!session) {
      throw new UserFacingError('Iniciá sesión para restaurar transacciones.')
    }

    const childIds = state.transactions
      .filter((tx) => tx.splitParentId === transactionId)
      .map((tx) => tx.id)

    const restored = await remoteUnsplitTransaction(session, parent, childIds)
    const store = transactionStore.getState()
    store.updateTransaction(restored.id, restored)
    store.removeTransactions(childIds)
    setError('')
  }

  async function handleBulkCategorizeTransactions(
    transactionIds: string[],
    category: string
  ): Promise<{ updated: number }> {
    if (!category.trim()) {
      throw new UserFacingError('Elegí una categoría.')
    }
    if (transactionIds.length === 0) {
      return { updated: 0 }
    }
    const ids = new Set(transactionIds)
    const targets = transactionStore
      .getState()
      .transactions.filter((tx) => ids.has(tx.id))
    if (targets.length === 0) {
      throw MISSING_TRANSACTION
    }
    const targetIds = new Set(targets.map((tx) => tx.id))

    if (session) {
      await Promise.all(
        targets.map((tx) =>
          updateRemoteTransaction(session, tx.id, {
            category,
            categoryConfidence: 1,
          })
        )
      )
    }

    transactionStore
      .getState()
      .mapTransactions((tx) =>
        targetIds.has(tx.id) ? { ...tx, category, categoryConfidence: 1 } : tx
      )
    setError('')
    return { updated: targets.length }
  }

  async function handleBulkTagTransactions(
    transactionIds: string[],
    tag: string
  ): Promise<{ updated: number }> {
    const trimmedTag = tag.trim()
    if (!trimmedTag) {
      throw new UserFacingError('Escribí una etiqueta.')
    }
    const ids = new Set(transactionIds)
    // Rows that already carry the tag are left alone and not counted.
    const targets = transactionStore
      .getState()
      .transactions.filter(
        (tx) => ids.has(tx.id) && !(tx.tags ?? []).includes(trimmedTag)
      )
    const targetIds = new Set(targets.map((tx) => tx.id))

    if (session) {
      await Promise.all(
        targets.map((tx) =>
          updateRemoteTransaction(session, tx.id, {
            tags: [...(tx.tags ?? []), trimmedTag],
          })
        )
      )
    }

    transactionStore
      .getState()
      .mapTransactions((tx) =>
        targetIds.has(tx.id)
          ? { ...tx, tags: [...(tx.tags ?? []), trimmedTag] }
          : tx
      )
    setError('')
    return { updated: targets.length }
  }

  async function handleAutoCategorizeTransactions(
    transactionIds: string[]
  ): Promise<{ categorized: number }> {
    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)

    // Build smart categorization context
    const overrides = listMerchantCategoryOverrides()
    const categorizedMerchants = [
      ...Object.entries(overrides).map(([name, o]) => ({
        name,
        category: o.category,
      })),
      ...state.transactions
        .filter((t) => t.category && t.category !== 'uncategorized')
        .map((t) => ({ name: t.description, category: t.category! })),
    ]

    const temporalPatterns = analyzeTemporalPatterns(
      state.transactions.map((t) => ({
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        date: t.date instanceof Date ? t.date : new Date(t.date),
      }))
    )

    const context: CategorizationContext = {
      categorizedMerchants,
      temporalPatterns,
    }

    const matched = new Map<
      string,
      { category: string; categoryConfidence: number }
    >()
    state.transactions
      .filter((transaction) => targetIds.has(transaction.id))
      .forEach((transaction) => {
        const result = categorizeTransaction(
          transaction.description,
          transaction.type,
          {
            ...context,
            amount: transaction.amount,
            currency: transaction.currency,
          }
        )
        if (result.category !== 'uncategorized') {
          matched.set(transaction.id, {
            category: result.category,
            categoryConfidence: result.confidence,
          })
        }
      })

    if (matched.size === 0) {
      return { categorized: 0 }
    }

    if (session) {
      await Promise.all(
        Array.from(matched.entries()).map(([id, update]) =>
          updateRemoteTransaction(session, id, update)
        )
      )
    }

    transactionStore.getState().mapTransactions((transaction) => {
      const update = matched.get(transaction.id)
      return update ? { ...transaction, ...update } : transaction
    })
    setError('')
    return { categorized: matched.size }
  }

  // Applies a just-created rule to existing rows. Rows are written one by
  // one; those that saved stay applied (locally too) and the rest are
  // reported, so the count matches the server. Split parts keep their own
  // categories, as with apply-to-similar edits.
  async function handleApplyPatternToPast(
    pattern: CustomPattern
  ): Promise<{ updated: number; failed: number }> {
    const currentSession = sessionRef.current
    if (!currentSession) {
      throw new UserFacingError(
        'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
      )
    }
    const targets = transactionStore
      .getState()
      .transactions.filter(
        (tx) => !tx.splitParentId && testPattern(tx.description, pattern)
      )
    const changes = {
      category: pattern.category,
      categoryConfidence: 0.95,
      ...(pattern.description && {
        displayDescription: pattern.description,
      }),
    }
    const results = await Promise.allSettled(
      targets.map((tx) =>
        updateRemoteTransaction(currentSession, tx.id, changes)
      )
    )
    const saved = new Set(
      targets
        .filter((_, i) => results[i].status === 'fulfilled')
        .map((tx) => tx.id)
    )
    transactionStore
      .getState()
      .mapTransactions((tx) => (saved.has(tx.id) ? { ...tx, ...changes } : tx))
    return { updated: saved.size, failed: targets.length - saved.size }
  }

  return {
    handleTransactionsImported,
    handleUpdateTransaction,
    handleDeleteTransaction,
    handleRestoreTransactions,
    handleSplitTransaction,
    handleUnsplitTransaction,
    handleBulkCategorizeTransactions,
    handleBulkDeleteTransactions,
    handleBulkTagTransactions,
    handleAutoCategorizeTransactions,
    handleApplyPatternToPast,
  }
}
