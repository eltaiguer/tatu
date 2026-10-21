// The production adapter of the repository port (#119): one signed-in user's
// data in Supabase. It composes the single-request functions in
// `services/supabase/*` and owns how large writes are cut (`batching.ts`):
// ≤100-id `.in()` updates settled independently (#60), sequential 500-row
// import inserts that stop at the first failure (#61).
import {
  countSplitParts,
  deleteSplitParts,
  findExistingTransactionIds,
  findImportCandidates,
  hardDeleteTransactionsByIds,
  loadUserTransactions,
  persistTransactions,
  setSplitParentFlag,
  setTransactionsDeleted,
  updateTransactionsByIds,
  insertSplitParts,
} from '../supabase/transactions'
import {
  completeImportRun,
  createImportRun,
  failImportRun,
} from '../supabase/import-runs'
import {
  deleteCategoryOverride,
  listCategoryOverrides,
  upsertCategoryOverride,
} from '../supabase/category-overrides'
import {
  deleteDescriptionOverride,
  listDescriptionOverrides,
  upsertDescriptionOverride,
} from '../supabase/description-overrides'
import {
  deleteCustomPattern,
  listCustomPatterns,
  upsertCustomPattern,
} from '../supabase/custom-patterns'
import {
  archiveCustomCategory,
  listCustomCategories,
  upsertCustomCategory,
} from '../supabase/custom-categories'
import {
  loadUserPreferences,
  saveUserPreferences,
} from '../supabase/user-preferences'
import { loadCachedInsights, saveInsights } from '../supabase/ai-insights'
import { resetUserSupabaseData } from '../supabase/reset'
import { UserFacingError } from '../../utils/user-error'
import { groupByPatch, insertSequentially, settleChunks } from './batching'
import {
  SPLIT_CONFLICT_MESSAGE,
  SplitIncompleteError,
  UnsplitIncompleteError,
  type Repository,
} from './repository'

export function createSupabaseRepository(userId: string): Repository {
  return {
    userId,

    async loadWorkspace() {
      const [
        transactions,
        categoryOverrides,
        descriptionOverrides,
        customPatterns,
        customCategories,
        preferences,
      ] = await Promise.all([
        loadUserTransactions(userId),
        listCategoryOverrides(userId),
        listDescriptionOverrides(userId),
        listCustomPatterns(userId),
        listCustomCategories(userId),
        loadUserPreferences(userId),
      ])
      return {
        transactions,
        categoryOverrides,
        descriptionOverrides,
        customPatterns,
        customCategories,
        preferences,
      }
    },
    loadTransactions: () => loadUserTransactions(userId),
    loadCategoryOverrides: () => listCategoryOverrides(userId),
    savePreferences: (preferences) => saveUserPreferences(userId, preferences),

    findImportCandidates: (incoming) => findImportCandidates(userId, incoming),
    findExistingIds: (ids) => findExistingTransactionIds(userId, ids),

    insertTransactions(rows, options) {
      return insertSequentially(
        rows,
        (part) =>
          persistTransactions(userId, part, { importId: options?.importId }),
        options?.shouldContinue
      )
    },
    updateTransactions(changes) {
      return settleChunks(
        groupByPatch(changes).map(({ patch, ids }) => ({
          ids,
          write: (chunk) => updateTransactionsByIds(userId, chunk, patch),
        }))
      )
    },
    softDeleteTransactions(ids) {
      return settleChunks([
        { ids, write: (chunk) => setTransactionsDeleted(userId, chunk, true) },
      ])
    },
    restoreTransactions(ids) {
      return settleChunks([
        {
          ids,
          write: (chunk) => setTransactionsDeleted(userId, chunk, false),
        },
      ])
    },
    hardDeleteTransactions(ids) {
      return settleChunks([
        { ids, write: (chunk) => hardDeleteTransactionsByIds(userId, chunk) },
      ])
    },

    // Parts first, then the flag: whatever fails, the server never holds a
    // split parent without parts (a row nobody could see or repair).
    //
    // The parts are inserted, not upserted: a parent split on another device
    // already holds parts with these (deterministic) ids, so the insert fails
    // as a whole and nothing of that device's split is touched. Once the
    // insert succeeded, the parts are this split's own — the only ones a
    // compensation ever deletes.
    async splitTransaction(parent, parts) {
      const partIds = parts.map((part) => part.id)
      if ((await insertSplitParts(userId, parts)) === 'taken') {
        throw new UserFacingError(SPLIT_CONFLICT_MESSAGE)
      }
      let marked: number
      try {
        marked = await setSplitParentFlag(userId, parent.id, true, {
          onlyIfSplit: false,
        })
      } catch (error) {
        // The mark may have committed with its response lost: remove this
        // split's parts, then clear the flag — only if no parts point at the
        // parent any more, so another device's split is never undone.
        try {
          await deleteSplitParts(userId, parent.id, partIds)
          if ((await countSplitParts(userId, parent.id)) === 0) {
            await setSplitParentFlag(userId, parent.id, false)
          }
        } catch {
          throw new SplitIncompleteError(error)
        }
        throw error
      }
      if (marked === 0) {
        // Split (or deleted) meanwhile: take back only this split's parts.
        try {
          await deleteSplitParts(userId, parent.id, partIds)
        } catch (error) {
          throw new SplitIncompleteError(error)
        }
        throw new UserFacingError(SPLIT_CONFLICT_MESSAGE)
      }
    },

    // Flag first, then the parts (all of them, not just the ones this device
    // knows): a failure leaves parent and parts visible, never a split parent
    // without parts.
    async unsplitTransaction(parent) {
      const unmarked = await setSplitParentFlag(userId, parent.id, false)
      if (unmarked === 0) {
        throw new UserFacingError(
          'La transacción ya no existe. Recargá para ver el estado actual.'
        )
      }
      try {
        await deleteSplitParts(userId, parent.id)
      } catch (error) {
        try {
          // The delete may have committed with its response lost: mark the
          // parent again only if parts are still there.
          if ((await countSplitParts(userId, parent.id)) === 0) return
          await setSplitParentFlag(userId, parent.id, true)
        } catch {
          throw new UnsplitIncompleteError(error)
        }
        throw error
      }
    },

    createImportRun: (input) => createImportRun(userId, input),
    completeImportRun: (importId, stats) =>
      completeImportRun(userId, importId, stats),
    failImportRun: (importId, message) =>
      failImportRun(userId, importId, message),

    upsertDescriptionOverride: (input) =>
      upsertDescriptionOverride(userId, input),
    deleteDescriptionOverride: (key) => deleteDescriptionOverride(userId, key),
    upsertCategoryOverride: (input) => upsertCategoryOverride(userId, input),
    deleteCategoryOverride: (key) => deleteCategoryOverride(userId, key),
    upsertCustomPattern: (pattern) => upsertCustomPattern(userId, pattern),
    deleteCustomPattern: (id) => deleteCustomPattern(userId, id),
    upsertCustomCategory: (input) => upsertCustomCategory(userId, input),
    archiveCustomCategory: (id) => archiveCustomCategory(userId, id),

    loadInsights: () => loadCachedInsights(userId),
    saveInsights: (row) => saveInsights(userId, row),

    resetAll: () => resetUserSupabaseData(userId),
  }
}
