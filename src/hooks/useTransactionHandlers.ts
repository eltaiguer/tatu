import type { SupabaseSession } from '../services/supabase/client'
import type { Transaction } from '../models'
import { transactionStore } from '../stores/transaction-store'
import {
  persistTransactions,
  softDeleteTransaction,
  updateTransaction as updateRemoteTransaction,
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
import { buildDescriptionOverrideKey } from '../services/descriptions/normalization'
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
  getAiConfig,
  enrichTransactionsWithAi,
  applyAiEnrichment,
} from '../services/ai'
import { buildCorrectionContext } from '../services/ai/correction-context'

export function useTransactionHandlers({
  session,
  setError,
  setNotice,
}: {
  session: SupabaseSession | null
  setError: (msg: string) => void
  setNotice: (msg: string) => void
}) {
  async function handleTransactionsImported(
    transactionsToImport: Transaction[],
    context?: {
      parsedData: {
        fileType: 'credit_card' | 'bank_account_usd' | 'bank_account_uyu'
      }
      csvContent: string
      fileName: string
    }
  ) {
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
          const results = await enrichTransactionsWithAi(
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
        } catch {
          // AI failed — fall through with rule-based results already on transactions
        }
      }
    }

    try {
      await persistTransactions(session, toStore, {
        importId: importRunId ?? undefined,
      })
      state.addTransactions(toStore)

      if (importRunId) {
        await completeImportRun(session, importRunId, {
          totalRows: transactionsToImport.length,
          insertedRows: added.length,
          duplicateRows: duplicates.length,
        })
      }
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

    return { added, duplicates }
  }

  async function handleUpdateTransaction(
    transactionId: string,
    updates: {
      displayDescription?: string
      category?: string
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ) {
    const state = transactionStore.getState()
    const current = state.transactions.find((tx) => tx.id === transactionId)
    if (!current) {
      return
    }

    const trimmedDisplayDescription = updates.displayDescription?.trim()
    const applyToMatching = updates.applyScope === 'matching_past_and_future'
    const applyToFutureOnly = updates.applyScope === 'future_matching_only'
    const nextCategory = updates.category?.trim() || undefined
    const nextTags = updates.tags

    if (applyToMatching) {
      const targetKey = buildDescriptionOverrideKey(current.description)
      const matchingTransactions = state.transactions.filter(
        (tx) => {
          const key = buildDescriptionOverrideKey(tx.description)
          return key !== null && key === targetKey
        }
      )

      try {
        if (
          trimmedDisplayDescription &&
          trimmedDisplayDescription !== current.description
        ) {
          await setDescriptionOverrideWithSync({
            description: current.description,
            friendlyDescription: trimmedDisplayDescription,
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

        if (session) {
          await Promise.all(
            matchingTransactions.map((tx) =>
              updateRemoteTransaction(session, tx.id, {
                category: nextCategory,
                ...(nextCategory !== undefined && { categoryConfidence: 1 }),
                displayDescription: undefined,
              })
            )
          )

          if (nextTags !== undefined) {
            await updateRemoteTransaction(session, transactionId, {
              tags: nextTags,
            })
          }
        }

        state.setTransactions(
          state.transactions.map((tx) => {
            if (
              buildDescriptionOverrideKey(tx.description) !== targetKey
            ) {
              return tx
            }

            const categoryUpdates = nextCategory
              ? { category: nextCategory, categoryConfidence: 1 as const }
              : {}
            const tagsUpdates =
              tx.id === transactionId && nextTags !== undefined
                ? { tags: nextTags }
                : {}

            return {
              ...tx,
              ...categoryUpdates,
              ...tagsUpdates,
              displayDescription: undefined,
            }
          })
        )
        setError('')
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'No se pudo actualizar la transacción'
        )
      }
      return
    }

    if (applyToFutureOnly) {
      try {
        if (
          trimmedDisplayDescription &&
          trimmedDisplayDescription !== current.description
        ) {
          await setDescriptionOverrideWithSync({
            description: current.description,
            friendlyDescription: trimmedDisplayDescription,
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

        if (session) {
          await updateRemoteTransaction(session, transactionId, {
            displayDescription:
              trimmedDisplayDescription &&
              trimmedDisplayDescription !== current.description
                ? trimmedDisplayDescription
                : undefined,
            category: nextCategory,
            ...(nextCategory !== undefined && { categoryConfidence: 1 }),
            tags: nextTags,
          })
        }

        state.updateTransaction(transactionId, {
          displayDescription:
            trimmedDisplayDescription &&
            trimmedDisplayDescription !== current.description
              ? trimmedDisplayDescription
              : undefined,
          category: nextCategory,
          ...(nextCategory !== undefined && { categoryConfidence: 1 }),
          tags: nextTags,
        })
        setError('')
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'No se pudo actualizar la transacción'
        )
      }
      return
    }

    try {
      const singleDisplayDescription =
        trimmedDisplayDescription &&
        trimmedDisplayDescription !== current.description
          ? trimmedDisplayDescription
          : undefined

      if (session) {
        await updateRemoteTransaction(session, transactionId, {
          displayDescription: singleDisplayDescription,
          category: nextCategory,
          ...(nextCategory !== undefined && { categoryConfidence: 1 }),
          tags: nextTags,
        })
      }

      state.updateTransaction(transactionId, {
        displayDescription: singleDisplayDescription,
        category: nextCategory,
        ...(nextCategory !== undefined && { categoryConfidence: 1 }),
        tags: nextTags,
      })
      setError('')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar la transacción'
      )
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    const state = transactionStore.getState()

    try {
      if (session) {
        await softDeleteTransaction(session, transactionId)
      }

      state.removeTransaction(transactionId)
      setError('')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar la transacción'
      )
    }
  }

  async function handleBulkCategorizeTransactions(
    transactionIds: string[],
    category: string
  ) {
    if (transactionIds.length === 0 || !category.trim()) {
      return
    }

    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)

    try {
      if (session) {
        await Promise.all(
          transactionIds.map((id) =>
            updateRemoteTransaction(session, id, { category, categoryConfidence: 1 })
          )
        )
      }

      state.setTransactions(
        state.transactions.map((transaction) => {
          if (!targetIds.has(transaction.id)) {
            return transaction
          }
          return { ...transaction, category, categoryConfidence: 1 }
        })
      )
      setError('')
      setNotice(
        `${transactionIds.length} transacción${transactionIds.length === 1 ? '' : 'es'} categorizada${transactionIds.length === 1 ? '' : 's'}`
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudieron categorizar las transacciones'
      )
      setNotice('')
    }
  }

  async function handleBulkDeleteTransactions(transactionIds: string[]) {
    if (transactionIds.length === 0) {
      return
    }

    const state = transactionStore.getState()

    try {
      if (session) {
        await Promise.all(
          transactionIds.map((id) => softDeleteTransaction(session, id))
        )
      }

      const targetIds = new Set(transactionIds)
      state.setTransactions(
        state.transactions.filter(
          (transaction) => !targetIds.has(transaction.id)
        )
      )
      setError('')
      setNotice(
        `${transactionIds.length} transacción${transactionIds.length === 1 ? '' : 'es'} eliminada${transactionIds.length === 1 ? '' : 's'}`
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudieron eliminar las transacciones'
      )
      setNotice('')
    }
  }

  async function handleBulkTagTransactions(
    transactionIds: string[],
    tag: string
  ) {
    if (transactionIds.length === 0 || !tag.trim()) {
      return
    }

    const trimmedTag = tag.trim()
    const state = transactionStore.getState()
    const targetIds = new Set(transactionIds)

    try {
      if (session) {
        await Promise.all(
          transactionIds.map((id) => {
            const transaction = state.transactions.find((tx) => tx.id === id)
            const currentTags = transaction?.tags ?? []
            if (currentTags.includes(trimmedTag)) {
              return Promise.resolve()
            }
            return updateRemoteTransaction(session, id, {
              tags: [...currentTags, trimmedTag],
            })
          })
        )
      }

      state.setTransactions(
        state.transactions.map((transaction) => {
          if (!targetIds.has(transaction.id)) {
            return transaction
          }
          const currentTags = transaction.tags ?? []
          if (currentTags.includes(trimmedTag)) {
            return transaction
          }
          return { ...transaction, tags: [...currentTags, trimmedTag] }
        })
      )
      setError('')
      setNotice(
        `Tag "${trimmedTag}" agregado a ${transactionIds.length} transacción${transactionIds.length === 1 ? '' : 'es'}`
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudo agregar el tag'
      )
      setNotice('')
    }
  }

  async function handleAutoCategorizeTransactions(transactionIds: string[]) {
    if (transactionIds.length === 0) {
      return
    }

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
        .filter(
          (t) =>
            t.category && t.category !== 'uncategorized'
        )
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

    const categorizedTransactions = state.transactions
      .filter((transaction) => targetIds.has(transaction.id))
      .map((transaction) => {
        const result = categorizeTransaction(
          transaction.description,
          transaction.type,
          {
            ...context,
            amount: transaction.amount,
            currency: transaction.currency,
          }
        )

        return {
          id: transaction.id,
          category: result.category,
          categoryConfidence: result.confidence,
        }
      })

    const matchedTransactions = categorizedTransactions.filter(
      (transaction) => transaction.category !== 'uncategorized'
    )

    if (matchedTransactions.length === 0) {
      setNotice(
        'No se encontraron categorías automáticas para las transacciones seleccionadas'
      )
      return
    }

    try {
      if (session) {
        await Promise.all(
          matchedTransactions.map((transaction) =>
            updateRemoteTransaction(session, transaction.id, {
              category: transaction.category,
              categoryConfidence: transaction.categoryConfidence,
            })
          )
        )
      }

      state.setTransactions(
        state.transactions.map((transaction) => {
          const categorized = matchedTransactions.find(
            (entry) => entry.id === transaction.id
          )

          if (!categorized) {
            return transaction
          }

          return {
            ...transaction,
            category: categorized.category,
            categoryConfidence: categorized.categoryConfidence,
          }
        })
      )
      setError('')
      setNotice(
        `${matchedTransactions.length} transacción${matchedTransactions.length === 1 ? '' : 'es'} auto-categorizada${matchedTransactions.length === 1 ? '' : 's'}`
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'No se pudieron auto-categorizar las transacciones'
      )
      setNotice('')
    }
  }

  return {
    handleTransactionsImported,
    handleUpdateTransaction,
    handleDeleteTransaction,
    handleBulkCategorizeTransactions,
    handleBulkDeleteTransactions,
    handleBulkTagTransactions,
    handleAutoCategorizeTransactions,
  }
}
