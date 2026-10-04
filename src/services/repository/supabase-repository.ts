// The production adapter of the repository port (#119): one signed-in user's
// data in Supabase. It composes the single-request functions in
// `services/supabase/*` and owns how large writes are cut (`batching.ts`):
// ≤100-id `.in()` updates settled independently (#60), sequential 500-row
// import inserts that stop at the first failure (#61).
import type { SupabaseSession } from '../supabase/client'
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
import { UserFacingError } from '../../utils/user-error'
import { groupByPatch, insertSequentially, settleChunks } from './batching'
import {
  SPLIT_CONFLICT_MESSAGE,
  SplitIncompleteError,
  UnsplitIncompleteError,
  type Repository,
} from './repository'

export function createSupabaseRepository(session: SupabaseSession): Repository {
  return {
    userId: session.user.id,

    async loadWorkspace() {
      const [
        transactions,
        categoryOverrides,
        descriptionOverrides,
        customPatterns,
        customCategories,
        preferences,
      ] = await Promise.all([
        loadUserTransactions(session),
        listCategoryOverrides(session),
        listDescriptionOverrides(session),
        listCustomPatterns(session),
        listCustomCategories(session),
        loadUserPreferences(session),
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
    savePreferences: (preferences) => saveUserPreferences(session, preferences),

    findImportCandidates: (incoming) => findImportCandidates(session, incoming),
    findExistingIds: (ids) => findExistingTransactionIds(session, ids),

    insertTransactions(rows, options) {
      return insertSequentially(
        rows,
        (part) =>
          persistTransactions(session, part, { importId: options?.importId }),
        options?.shouldContinue
      )
    },
    updateTransactions(changes) {
      return settleChunks(
        groupByPatch(changes).map(({ patch, ids }) => ({
          ids,
          write: (chunk) => updateTransactionsByIds(session, chunk, patch),
        }))
      )
    },
    softDeleteTransactions(ids) {
      return settleChunks([
        { ids, write: (chunk) => setTransactionsDeleted(session, chunk, true) },
      ])
    },
    restoreTransactions(ids) {
      return settleChunks([
        {
          ids,
          write: (chunk) => setTransactionsDeleted(session, chunk, false),
        },
      ])
    },
    hardDeleteTransactions(ids) {
      return settleChunks([
        { ids, write: (chunk) => hardDeleteTransactionsByIds(session, chunk) },
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
      if ((await insertSplitParts(session, parts)) === 'taken') {
        throw new UserFacingError(SPLIT_CONFLICT_MESSAGE)
      }
      let marked: number
      try {
        marked = await setSplitParentFlag(session, parent.id, true, {
          onlyIfSplit: false,
        })
      } catch (error) {
        // The mark may have committed with its response lost: remove this
        // split's parts, then clear the flag — only if no parts point at the
        // parent any more, so another device's split is never undone.
        try {
          await deleteSplitParts(session, parent.id, partIds)
          if ((await countSplitParts(session, parent.id)) === 0) {
            await setSplitParentFlag(session, parent.id, false)
          }
        } catch {
          throw new SplitIncompleteError(error)
        }
        throw error
      }
      if (marked === 0) {
        // Split (or deleted) meanwhile: take back only this split's parts.
        try {
          await deleteSplitParts(session, parent.id, partIds)
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
      const unmarked = await setSplitParentFlag(session, parent.id, false)
      if (unmarked === 0) {
        throw new UserFacingError(
          'La transacción ya no existe. Recargá para ver el estado actual.'
        )
      }
      try {
        await deleteSplitParts(session, parent.id)
      } catch (error) {
        try {
          // The delete may have committed with its response lost: mark the
          // parent again only if parts are still there.
          if ((await countSplitParts(session, parent.id)) === 0) return
          await setSplitParentFlag(session, parent.id, true)
        } catch {
          throw new UnsplitIncompleteError(error)
        }
        throw error
      }
    },

    createImportRun: (input) => createImportRun(session, input),
    completeImportRun: (importId, stats) =>
      completeImportRun(session, importId, stats),
    failImportRun: (importId, message) =>
      failImportRun(session, importId, message),

    upsertDescriptionOverride: (input) =>
      upsertDescriptionOverride(session, input),
    deleteDescriptionOverride: (key) => deleteDescriptionOverride(session, key),
    upsertCategoryOverride: (input) => upsertCategoryOverride(session, input),
    deleteCategoryOverride: (key) => deleteCategoryOverride(session, key),
    upsertCustomPattern: (pattern) => upsertCustomPattern(session, pattern),
    deleteCustomPattern: (id) => deleteCustomPattern(session, id),
    upsertCustomCategory: (input) => upsertCustomCategory(session, input),
    archiveCustomCategory: (id) => archiveCustomCategory(session, id),
  }
}
