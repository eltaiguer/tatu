// Every change to a user's transactions, expressed once (#119). Each mutation
// works out one `TransactionPatch` per row from the store, sends it through
// the repository port, and applies to the store exactly what the server
// confirmed — the same patch, so the two can't drift ("screen mirrors
// database"). Apply-scope, split-row rules and override writes live here.
//
// Rules every mutation follows:
// - Nothing is written to the store before the server answers.
// - A chunked write that saved some rows applies those, then throws a
//   PartialWriteError whose `retry` re-sends only the failed remainder.
// - After every await, before touching in-memory state, the workspace owner
//   is checked: if another user signed in meanwhile, nothing lands in their
//   store and a WorkspaceChangedError is thrown instead.
import type { Transaction } from '../../models'
import { transactionStore } from '../../stores/transaction-store'
import { isWorkspaceOwner } from '../../stores/workspace-state'
import {
  applyPatch,
  isEmptyPatch,
  SplitIncompleteError,
  UnsplitIncompleteError,
  type Repository,
  type TransactionPatch,
  type WriteOutcome,
} from '../repository/repository'
import {
  classifyImport,
  type ImportClassification,
} from '../dedup/import-dedup'
import { sha256Hex } from '../supabase/import-runs'
import {
  countSimilarEditReach,
  findSimilarTransactions,
} from '../descriptions/similar-transactions'
import { buildDescriptionOverrideKey } from '../descriptions/normalization'
import {
  clearDescriptionOverride,
  getDescriptionOverride,
  listDescriptionOverrides,
  setDescriptionOverride,
} from '../descriptions/description-overrides'
import {
  clearMerchantCategoryOverride,
  getMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  setMerchantCategoryOverride,
} from '../categorizer/category-overrides'
import { normalizeMerchantName } from '../categorizer/merchant-patterns'
import {
  categorizeTransaction,
  type CategorizationContext,
} from '../categorizer/transaction-categorizer'
import { analyzeTemporalPatterns } from '../categorizer/temporal-patterns'
import { testPattern, type CustomPattern } from '../categorizer/custom-patterns'
import { applyAiEnrichment, enrichTransactionsWithAi, getAiConfig } from '../ai'
import { buildCorrectionContext } from '../ai/correction-context'
import {
  NeedsConfirmationError,
  PartialWriteError,
  UserFacingError,
  WorkspaceChangedError,
} from '../../utils/user-error'

const MISSING_TRANSACTION = new UserFacingError(
  'La transacción ya no existe. Recargá para ver el estado actual.'
)
const MISSING_ON_SERVER =
  'La transacción ya no existe en el servidor. Recargá para ver el estado actual.'

/** Throws unless `repo`'s user still owns the in-memory workspace. */
function assertOwner(repo: Repository): void {
  if (!isWorkspaceOwner(repo.userId)) throw new WorkspaceChangedError()
}

const store = () => transactionStore.getState()

// Deleting a split row can't be undone: a parent's parts are hard-deleted, and
// a soft-deleted part would collide with a later re-split's deterministic ids.
function isSplitRow(tx: Transaction): boolean {
  return Boolean(tx.isSplitParent || tx.splitParentId)
}

/**
 * Turns a chunked write's outcome into the caller's answer: nothing to say
 * when every row saved; the first error when none did; otherwise a
 * PartialWriteError ("Se actualizaron N de M") that can retry the rows whose
 * request failed. Rows gone from the server are never retried.
 */
function settle<R>(
  outcome: WriteOutcome,
  options: {
    message: (done: number, total: number) => string
    retry?: (failedIds: string[]) => Promise<unknown>
    result?: R
    /** Report even a total failure as partial (something else did save). */
    alwaysPartial?: boolean
  }
): void {
  const { saved, failed, missing, error } = outcome
  if (failed.length === 0 && missing.length === 0) return
  const total = saved.length + failed.length + missing.length
  if (saved.length === 0 && !options.alwaysPartial) {
    if (failed.length > 0) throw error
    throw new UserFacingError(MISSING_ON_SERVER)
  }
  const retry =
    failed.length > 0 && options.retry
      ? () => options.retry!(failed)
      : undefined
  const suffix =
    missing.length > 0 && !retry ? '. Recargá para ver el estado actual.' : ''
  throw new PartialWriteError(
    options.message(saved.length, total) + suffix,
    saved.length,
    total,
    retry,
    options.result
  )
}

const updatedMessage = (done: number, total: number) =>
  `Se actualizaron ${done} de ${total}`

/**
 * Sends one patch per row and applies to the store exactly the rows the
 * server confirmed. Returns the outcome; `settle` decides what to report.
 */
async function writePatches(
  repo: Repository,
  changes: Map<string, TransactionPatch>
): Promise<WriteOutcome> {
  const outcome = await repo.updateTransactions(changes)
  assertOwner(repo)
  const saved = new Set(outcome.saved)
  if (saved.size > 0) {
    store().mapTransactions((tx) =>
      saved.has(tx.id) ? applyPatch(tx, changes.get(tx.id)!) : tx
    )
  }
  return outcome
}

/** Same patches again, for the ids still in the store. */
async function retryPatches(
  repo: Repository,
  changes: Map<string, TransactionPatch>,
  ids: string[]
): Promise<{ updated: number }> {
  assertOwner(repo)
  const present = new Set(store().transactions.map((tx) => tx.id))
  const subset = new Map(
    ids.filter((id) => present.has(id)).map((id) => [id, changes.get(id)!])
  )
  if (subset.size === 0) throw MISSING_TRANSACTION
  const outcome = await writePatches(repo, subset)
  settle(outcome, {
    message: updatedMessage,
    retry: (failed) => retryPatches(repo, changes, failed),
  })
  return { updated: outcome.saved.length }
}

// ---------------------------------------------------------------------------
// Import

export interface ImportContext {
  parsedData: {
    fileType: 'credit_card' | 'bank_account_usd' | 'bank_account_uyu'
  }
  csvContent: string
  fileName: string
}

export interface ImportResult {
  added: Transaction[]
  duplicates: Transaction[]
  /** Rows the user deleted before; skipped so they stay deleted. */
  previouslyDeleted: Transaction[]
  /**
   * Stored rows whose garbled description (#192) this import rewrote in
   * place, as saved. Same id, category and names; not inserted.
   */
  repaired: Transaction[]
  /** Repairs the server did not confirm; importing again retries them. */
  repairsFailed?: number
  /** Enrichment did not run at all. */
  aiError?: string
  /** Enrichment ran but some batches failed; the rest were applied. */
  aiPartial?: string
}

// A salted id (`${id}_cN`) for a row dated outside the candidate window is
// not in the candidates, so salted ids are checked once more; a hit is salted
// past. Bounded: the insert fails rather than overwrite if one still slips by.
const SALT_CHECK_ROUNDS = 3

async function classifyAgainstServer(
  repo: Repository,
  incoming: Transaction[]
): Promise<ImportClassification> {
  const existing = await repo.findImportCandidates(incoming)
  assertOwner(repo)
  const taken = new Set(store().transactions.map((tx) => tx.id))
  const incomingIds = new Set(incoming.map((tx) => tx.id))
  let classification = classifyImport(incoming, existing, taken)
  for (let round = 0; round < SALT_CHECK_ROUNDS; round++) {
    const salted = classification.added
      .map((tx) => tx.id)
      .filter((id) => !incomingIds.has(id))
    if (salted.length === 0) break
    const found = await repo.findExistingIds(salted)
    assertOwner(repo)
    const hits = [...found.active, ...found.deleted]
    if (hits.length === 0) break
    hits.forEach((id) => taken.add(id))
    classification = classifyImport(incoming, existing, taken)
  }
  return classification
}

/** True when the row has a user rule that the AI must not override. */
function hasUserOverride(tx: Transaction): boolean {
  return (
    !!getDescriptionOverride(tx.description) ||
    !!getMerchantCategoryOverride(normalizeMerchantName(tx.description))
  )
}

/**
 * Imports a parsed statement. Classified against the server by content
 * (#57), optionally enriched by the AI (best-effort: its failure is returned
 * as `aiError`, never fails the import), then inserted in sequential chunks
 * (#61): if one fails, the chunks before it stay saved, exactly those rows
 * reach the store, the run is marked failed with "N de M guardadas", and the
 * error says to import the file again (dedup skips what was saved).
 */
export async function importTransactions(
  repo: Repository,
  incoming: Transaction[],
  context?: ImportContext
): Promise<ImportResult> {
  assertOwner(repo)
  const classification = await classifyAgainstServer(repo, incoming)
  const { added, duplicates, previouslyDeleted, repaired } = classification

  let importRunId: string | null = null
  if (context) {
    const fileChecksum = await sha256Hex(context.csvContent)
    importRunId = await repo.createImportRun({
      fileName: context.fileName,
      fileType: context.parsedData.fileType,
      fileChecksum,
    })
    assertOwner(repo)
  }

  // Read only while this user still owns the workspace: the AI config and
  // the correction context are the signed-in user's.
  const aiConfig = getAiConfig()
  let toStore = added
  let aiError: string | undefined
  let aiPartial: string | undefined
  if (aiConfig?.enabled && aiConfig.apiKey && added.length > 0) {
    const toEnrich = added.filter((tx) => !hasUserOverride(tx))
    if (toEnrich.length > 0) {
      try {
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
          buildCorrectionContext()
        )
        toStore = applyAiEnrichment(added, results)
        aiPartial = partialFailure
      } catch (error) {
        aiError =
          error instanceof Error ? error.message : 'Error desconocido de IA'
        console.error('AI enrichment failed during import:', error)
      }
      assertOwner(repo)
    }
  }

  // If the account changes between chunks the import stops; the chunks
  // already sent stay saved for the previous user, whose run may then stay
  // "processing" if marking it failed is refused under the new token.
  const { saved, error } = await repo.insertTransactions(toStore, {
    importId: importRunId ?? undefined,
    shouldContinue: () => isWorkspaceOwner(repo.userId),
  })
  const owner = isWorkspaceOwner(repo.userId)
  if (owner && saved.length > 0) store().addTransactions(saved)

  if (error !== undefined) {
    const reason =
      error instanceof Error ? error.message : 'Error de importación'
    if (importRunId) {
      try {
        await repo.failImportRun(
          importRunId,
          saved.length > 0
            ? `${saved.length} de ${toStore.length} guardadas: ${reason}`
            : reason
        )
      } catch (closeError) {
        console.error('Could not mark import run failed:', closeError)
      }
    }
    if (!owner) throw new WorkspaceChangedError()
    if (saved.length === 0) throw error
    throw new UserFacingError(
      `Se guardaron ${saved.length} de ${toStore.length} transacciones nuevas. Importá el archivo de nuevo para completar el resto.`
    )
  }
  if (!owner) throw new WorkspaceChangedError()

  const { saved: repairedSaved, failed: repairsFailed } = await repairRows(
    repo,
    repaired
  )

  // The rows are saved and visible; failing to close the audit record must
  // not report the import itself as failed.
  if (importRunId) {
    try {
      await repo.completeImportRun(importRunId, {
        totalRows: incoming.length,
        insertedRows: added.length,
        // The schema has no column for skipped deleted rows or repaired ones
        // (#192); neither was inserted, so they count as duplicates
        // (total = inserted + dup).
        duplicateRows:
          duplicates.length + previouslyDeleted.length + repaired.length,
      })
    } catch (closeError) {
      console.error('Could not complete import run record:', closeError)
    }
  }

  return {
    added,
    duplicates,
    previouslyDeleted,
    repaired: repairedSaved,
    ...(repairsFailed > 0 ? { repairsFailed } : {}),
    aiError,
    aiPartial,
  }
}

/**
 * Rewrites the description and raw_data of rows stored garbled (#192), and
 * patches the store with exactly what the server confirmed. Best-effort: the
 * import itself already succeeded, and a repair that failed is retried by
 * importing the file again (the row still matches).
 *
 * Rules learned from the garbled text are keyed on it, so they are copied to
 * the corrected text first (`moveRulesToRepairedText`); if that fails, no row
 * is repaired, so a re-import retries both and no name is lost meanwhile.
 */
async function repairRows(
  repo: Repository,
  repaired: Transaction[]
): Promise<{ saved: Transaction[]; failed: number }> {
  if (repaired.length === 0) return { saved: [], failed: 0 }
  const changes = new Map<string, TransactionPatch>(
    repaired.map((tx) => [
      tx.id,
      { description: tx.description, rawData: tx.rawData },
    ])
  )
  let outcome: WriteOutcome
  try {
    await moveRulesToRepairedText(repo, repaired)
    outcome = await writePatches(repo, changes)
  } catch (error) {
    if (error instanceof WorkspaceChangedError) throw error
    console.error('Could not repair garbled descriptions:', error)
    return { saved: [], failed: repaired.length }
  }
  // A row gone from the server (deleted elsewhere) needs no repair.
  const failed = outcome.failed.length
  if (failed > 0) {
    console.error('Could not repair garbled descriptions:', outcome.error)
  }
  const saved = new Set(outcome.saved)
  return { saved: repaired.filter((tx) => saved.has(tx.id)), failed }
}

/**
 * Copies the description override (friendly name) and the merchant category
 * override keyed on a repaired row's garbled description to its corrected
 * one, on the server and then in memory. A rule already saved for the
 * corrected text is kept as is. The garbled keys are kept too: other stored
 * rows may still carry that text until they are re-imported, and no new
 * import produces it, so they are inert otherwise.
 */
async function moveRulesToRepairedText(
  repo: Repository,
  repaired: Transaction[]
): Promise<void> {
  const before = new Map(store().transactions.map((tx) => [tx.id, tx]))
  const moves = new Map<string, { from: string; to: string }>()
  for (const tx of repaired) {
    const from = before.get(tx.id)?.description
    if (from !== undefined && from !== tx.description) {
      moves.set(JSON.stringify([from, tx.description]), {
        from,
        to: tx.description,
      })
    }
  }
  for (const { from, to } of moves.values()) {
    const name = getDescriptionOverride(from)
    const toKey = buildDescriptionOverrideKey(to)
    if (
      name &&
      toKey &&
      toKey !== buildDescriptionOverrideKey(from) &&
      !getDescriptionOverride(to)
    ) {
      await repo.upsertDescriptionOverride({
        descriptionNormalized: toKey,
        descriptionOriginal: to,
        friendlyDescription: name.friendlyDescription,
        category: name.category,
      })
      assertOwner(repo)
      setDescriptionOverride({
        description: to,
        friendlyDescription: name.friendlyDescription,
        category: name.category,
      })
    }
    const category = getMerchantCategoryOverride(from)
    const toMerchant = normalizeMerchantName(to)
    if (
      category &&
      toMerchant &&
      toMerchant !== normalizeMerchantName(from) &&
      !getMerchantCategoryOverride(to)
    ) {
      await repo.upsertCategoryOverride({
        merchantNormalized: toMerchant,
        merchantOriginal: to,
        category,
      })
      assertOwner(repo)
      setMerchantCategoryOverride(to, category)
    }
  }
}

// ---------------------------------------------------------------------------
// Editing a transaction: apply-scope + override writes

export type ApplyScope =
  | 'single'
  | 'matching_past_and_future'
  | 'future_matching_only'

export interface TransactionEdit {
  displayDescription?: string
  /** A category sets it; null clears it ("Sin categoría"); absent leaves it. */
  category?: string | null
  tags?: string[]
  applyScope: ApplyScope
}

/**
 * Saves the description override (the friendly name, when renamed; cleared
 * otherwise) and the merchant override (the category; cleared when none),
 * as one unit. Policy:
 *  1. Both go to the server first; in-memory overrides change only after.
 *  2. If the second write fails, the first is taken back on the server
 *     (previous override restored, or deleted if there was none) and the
 *     error is rethrown: nothing changed anywhere.
 *  3. If taking it back fails too, the in-memory overrides show what the
 *     server now holds (the first write) and the error says so.
 */
async function writeOverrides(
  repo: Repository,
  current: Transaction,
  intent: { renamed: boolean; name?: string; category: string | null }
): Promise<void> {
  const description = current.description
  const descKey = buildDescriptionOverrideKey(description)
  const merchantKey = normalizeMerchantName(description)
  const previousDesc = descKey ? listDescriptionOverrides()[descKey] : undefined

  const applyDescLocally = () => {
    if (intent.renamed) {
      setDescriptionOverride({
        description,
        friendlyDescription: intent.name!,
        category: intent.category ?? undefined,
      })
    } else {
      clearDescriptionOverride(description)
    }
  }

  if (descKey) {
    if (intent.renamed) {
      await repo.upsertDescriptionOverride({
        descriptionNormalized: descKey,
        descriptionOriginal: description,
        friendlyDescription: intent.name!,
        category: intent.category ?? undefined,
      })
    } else {
      await repo.deleteDescriptionOverride(descKey)
    }
    assertOwner(repo)
  }

  if (merchantKey) {
    try {
      if (intent.category) {
        await repo.upsertCategoryOverride({
          merchantNormalized: merchantKey,
          merchantOriginal: description,
          category: intent.category,
        })
      } else {
        await repo.deleteCategoryOverride(merchantKey)
      }
    } catch (error) {
      if (!descKey) throw error
      try {
        if (previousDesc) {
          await repo.upsertDescriptionOverride({
            descriptionNormalized: descKey,
            descriptionOriginal: previousDesc.descriptionOriginal,
            friendlyDescription: previousDesc.friendlyDescription,
            category: previousDesc.category,
          })
        } else {
          await repo.deleteDescriptionOverride(descKey)
        }
      } catch {
        assertOwner(repo)
        applyDescLocally()
        throw new UserFacingError(
          'Se guardó el nombre, pero no la categoría. Intentá de nuevo.'
        )
      }
      throw error
    }
    assertOwner(repo)
  }

  applyDescLocally()
  if (intent.category) {
    setMerchantCategoryOverride(description, intent.category)
  } else {
    clearMerchantCategoryOverride(description)
  }
}

export async function editTransaction(
  repo: Repository,
  transactionId: string,
  edit: TransactionEdit
): Promise<{ affected: number }> {
  assertOwner(repo)
  const all = store().transactions
  const current = all.find((tx) => tx.id === transactionId)
  if (!current) throw MISSING_TRANSACTION

  const name = edit.displayDescription?.trim()
  const renamed = !!name && name !== current.description
  const category =
    edit.category === undefined ? undefined : edit.category?.trim() || null
  const tags = edit.tags

  if (edit.applyScope === 'matching_past_and_future') {
    // When the user renamed, the merchant-keyed description override becomes
    // the single source of the friendly name, so per-row names are cleared.
    // When they did not, per-row names (e.g. AI-enriched ones) are kept.
    // Without a category, the rows' categories are left alone.
    const matching = findSimilarTransactions(all, current)
    await writeOverrides(repo, current, {
      renamed,
      name,
      category: category ?? null,
    })

    const changes = new Map<string, TransactionPatch>()
    for (const tx of matching) {
      const patch: TransactionPatch = {
        ...(category && { category, categoryConfidence: 1 }),
        ...(renamed && { displayDescription: null }),
        ...(tx.id === transactionId && tags !== undefined && { tags }),
      }
      if (!isEmptyPatch(patch)) changes.set(tx.id, patch)
    }
    if (changes.size > 0) {
      const outcome = await writePatches(repo, changes)
      settle(outcome, {
        message: (done, total) =>
          `Se guardó la regla, pero se actualizaron ${done} de ${total} transacciones`,
        retry: (failed) => retryPatches(repo, changes, failed),
        alwaysPartial: true,
      })
    }
    return { affected: countSimilarEditReach(all, current, renamed) }
  }

  if (edit.applyScope === 'future_matching_only') {
    await writeOverrides(repo, current, {
      renamed,
      name,
      category: category ?? null,
    })
  }

  // One row: its name (cleared when not renamed), its category (set, or
  // cleared for "Sin categoría", with its confidence) and its tags.
  const patch: TransactionPatch = {
    displayDescription: renamed ? name : null,
    ...(category && { category, categoryConfidence: 1 }),
    ...(category === null && { category: null, categoryConfidence: null }),
    ...(tags !== undefined && { tags }),
  }
  const changes = new Map([[transactionId, patch]])
  const outcome = await writePatches(repo, changes)
  settle(outcome, {
    message:
      edit.applyScope === 'future_matching_only'
        ? () => 'Se guardó la regla, pero no se pudo actualizar la transacción'
        : updatedMessage,
    retry: (failed) => retryPatches(repo, changes, failed),
    alwaysPartial: edit.applyScope === 'future_matching_only',
  })
  return { affected: 1 }
}

// ---------------------------------------------------------------------------
// Delete and undo

export interface DeleteResult {
  removed: Transaction[]
  /** False when the delete hard-removed data, so no undo can be offered. */
  reversible: boolean
}

// Each undo is bound to the repository (user) that did the delete. Keyed by
// the `removed` array handed to the UI; anything else can't be undone.
const undoRepository = new WeakMap<Transaction[], Repository>()

const deletedMessage = (done: number, total: number) =>
  `Se eliminaron ${done} de ${total}`

/**
 * Non-part rows are soft-deleted first; then the parts of the split parents
 * that were deleted, and any part selected directly, are hard-deleted (their
 * ids are deterministic, so a soft-deleted part would block a re-split). A
 * part whose delete fails stays live and visible — it is an ordinary row —
 * and the retry deletes it.
 */
async function deleteRows(
  repo: Repository,
  targets: Transaction[]
): Promise<DeleteResult> {
  const all = store().transactions
  const softTargets = targets.filter((tx) => !tx.splitParentId)
  const partTargets = targets.filter((tx) => tx.splitParentId)

  const soft = await repo.softDeleteTransactions(softTargets.map((t) => t.id))
  assertOwner(repo)
  // A row already gone from the server is gone: done, like a saved one.
  const softDone = new Set([...soft.saved, ...soft.missing])
  const deletedParents = new Set(
    softTargets
      .filter((t) => t.isSplitParent && softDone.has(t.id))
      .map((t) => t.id)
  )
  const partIds = Array.from(
    new Set([
      ...all
        .filter(
          (tx) => tx.splitParentId && deletedParents.has(tx.splitParentId)
        )
        .map((tx) => tx.id),
      ...partTargets.map((t) => t.id),
    ])
  )
  const hard = await repo.hardDeleteTransactions(partIds)
  assertOwner(repo)
  const hardDone = new Set([...hard.saved, ...hard.missing])

  store().removeTransactions([...softDone, ...hardDone])
  const removed = targets.filter(
    (tx) => softDone.has(tx.id) || hardDone.has(tx.id)
  )
  const result: DeleteResult = {
    removed,
    reversible: !removed.some(isSplitRow),
  }
  if (result.reversible && removed.length > 0) {
    undoRepository.set(removed, repo)
  }

  const leftover = [...soft.failed, ...hard.failed]
  if (leftover.length > 0) {
    const done = softDone.size + hardDone.size
    const total = done + leftover.length
    if (done === 0) throw soft.error ?? hard.error
    throw new PartialWriteError(
      deletedMessage(done, total),
      done,
      total,
      () => deleteTransactions(repo, leftover, { allowIrreversible: true }),
      result
    )
  }
  return result
}

/**
 * Deletes rows. Throws NeedsConfirmationError before writing anything when
 * the delete can't be undone (split rows) and the caller hasn't confirmed.
 */
export async function deleteTransactions(
  repo: Repository,
  transactionIds: string[],
  options: { allowIrreversible?: boolean } = {}
): Promise<DeleteResult> {
  assertOwner(repo)
  if (transactionIds.length === 0) return { removed: [], reversible: true }
  const ids = new Set(transactionIds)
  const targets = store().transactions.filter((tx) => ids.has(tx.id))
  if (targets.length === 0) throw MISSING_TRANSACTION
  if (targets.some(isSplitRow) && !options.allowIrreversible) {
    throw new NeedsConfirmationError()
  }
  return deleteRows(repo, targets)
}

/**
 * Undo for a reversible delete, by the user who deleted: checked before
 * anything is sent. Puts back exactly the rows the server restored (rows
 * already present — re-imported meanwhile — are left as they are).
 */
export async function restoreDeleted(
  rows: Transaction[]
): Promise<{ restored: number }> {
  const repo = undoRepository.get(rows)
  if (!repo) {
    throw new UserFacingError('Ya no se puede deshacer esta eliminación.')
  }
  return restoreRows(repo, rows)
}

async function restoreRows(
  repo: Repository,
  rows: Transaction[]
): Promise<{ restored: number }> {
  assertOwner(repo)
  const outcome = await repo.restoreTransactions(rows.map((tx) => tx.id))
  assertOwner(repo)
  const saved = new Set(outcome.saved)
  store().addTransactions(rows.filter((tx) => saved.has(tx.id)))
  settle(outcome, {
    message: (done, total) => `Se restauraron ${done} de ${total}`,
    retry: (failed) =>
      restoreRows(
        repo,
        rows.filter((tx) => failed.includes(tx.id))
      ),
  })
  return { restored: saved.size }
}

// ---------------------------------------------------------------------------
// Split and unsplit

export interface SplitPart {
  description: string
  amount: number
  category?: string
}

function buildParts(parent: Transaction, parts: SplitPart[]): Transaction[] {
  return parts.map((part, i) => ({
    ...parent,
    id: `${parent.id}_split_${i}`,
    description: part.description,
    displayDescription: undefined,
    amount: part.amount,
    category: part.category,
    categoryConfidence: part.category ? 1 : undefined,
    isSplitParent: false,
    splitParentId: parent.id,
    balance: undefined,
    rawData: {},
    tags: [],
  }))
}

const INCOMPLETE_SPLIT_MESSAGE =
  'No se pudo terminar la operación: la transacción quedó junto a sus partes sin dividir. Eliminá las partes o intentá de nuevo.'

export async function splitTransaction(
  repo: Repository,
  transactionId: string,
  parts: SplitPart[]
): Promise<{ parts: number }> {
  assertOwner(repo)
  const parent = store().transactions.find((tx) => tx.id === transactionId)
  if (!parent) throw MISSING_TRANSACTION
  const children = buildParts(parent, parts)

  try {
    await repo.splitTransaction(parent, children)
  } catch (error) {
    if (error instanceof SplitIncompleteError) {
      // The server may hold the parts next to an unmarked parent: show that
      // (both visible, the parts deletable), never a parent without parts.
      assertOwner(repo)
      store().addTransactions(children)
      throw new UserFacingError(INCOMPLETE_SPLIT_MESSAGE)
    }
    throw error
  }
  assertOwner(repo)
  store().updateTransaction(parent.id, { isSplitParent: true })
  store().addTransactions(children)
  return { parts: children.length }
}

export async function unsplitTransaction(
  repo: Repository,
  transactionId: string
): Promise<void> {
  assertOwner(repo)
  const parent = store().transactions.find((tx) => tx.id === transactionId)
  if (!parent) throw MISSING_TRANSACTION

  try {
    await repo.unsplitTransaction(parent)
  } catch (error) {
    if (error instanceof UnsplitIncompleteError) {
      assertOwner(repo)
      store().updateTransaction(parent.id, { isSplitParent: false })
      throw new UserFacingError(INCOMPLETE_SPLIT_MESSAGE)
    }
    throw error
  }
  assertOwner(repo)
  const partIds = store()
    .transactions.filter((tx) => tx.splitParentId === transactionId)
    .map((tx) => tx.id)
  store().updateTransaction(parent.id, {
    isSplitParent: false,
    splitParentId: undefined,
  })
  store().removeTransactions(partIds)
}

// ---------------------------------------------------------------------------
// Bulk edits

export async function bulkCategorize(
  repo: Repository,
  transactionIds: string[],
  category: string
): Promise<{ updated: number }> {
  if (!category.trim()) throw new UserFacingError('Elegí una categoría.')
  assertOwner(repo)
  if (transactionIds.length === 0) return { updated: 0 }
  const ids = new Set(transactionIds)
  const targets = store().transactions.filter((tx) => ids.has(tx.id))
  if (targets.length === 0) throw MISSING_TRANSACTION

  const patch: TransactionPatch = { category, categoryConfidence: 1 }
  const outcome = await writePatches(
    repo,
    new Map(targets.map((tx) => [tx.id, patch]))
  )
  settle(outcome, {
    message: updatedMessage,
    retry: (failed) => bulkCategorize(repo, failed, category),
  })
  return { updated: outcome.saved.length }
}

export async function bulkTag(
  repo: Repository,
  transactionIds: string[],
  tag: string
): Promise<{ updated: number }> {
  const trimmed = tag.trim()
  if (!trimmed) throw new UserFacingError('Escribí una etiqueta.')
  assertOwner(repo)
  const ids = new Set(transactionIds)
  // Rows that already carry the tag are left alone and not counted.
  const targets = store().transactions.filter(
    (tx) => ids.has(tx.id) && !(tx.tags ?? []).includes(trimmed)
  )
  if (targets.length === 0) return { updated: 0 }

  const outcome = await writePatches(
    repo,
    new Map(
      targets.map((tx) => [tx.id, { tags: [...(tx.tags ?? []), trimmed] }])
    )
  )
  settle(outcome, {
    message: updatedMessage,
    retry: (failed) => bulkTag(repo, failed, trimmed),
  })
  return { updated: outcome.saved.length }
}

/**
 * Re-runs the categorizer with context (temporal patterns, categorized
 * merchants) on the selected rows and writes the results that aren't
 * `uncategorized` — one request per (category, confidence) per 100 rows.
 */
export async function autoCategorize(
  repo: Repository,
  transactionIds: string[]
): Promise<{ categorized: number }> {
  assertOwner(repo)
  const all = store().transactions
  const targetIds = new Set(transactionIds)

  const context: CategorizationContext = {
    categorizedMerchants: [
      ...Object.entries(listMerchantCategoryOverrides()).map(([name, o]) => ({
        name,
        category: o.category,
      })),
      ...all
        .filter((t) => t.category && t.category !== 'uncategorized')
        .map((t) => ({ name: t.description, category: t.category! })),
    ],
    temporalPatterns: analyzeTemporalPatterns(
      all.map((t) => ({
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        date: t.date instanceof Date ? t.date : new Date(t.date),
      }))
    ),
  }

  const changes = new Map<string, TransactionPatch>()
  for (const tx of all) {
    if (!targetIds.has(tx.id)) continue
    const result = categorizeTransaction(tx.description, tx.type, {
      ...context,
      amount: tx.amount,
      currency: tx.currency,
    })
    if (result.category !== 'uncategorized') {
      changes.set(tx.id, {
        category: result.category,
        categoryConfidence: result.confidence,
      })
    }
  }
  if (changes.size === 0) return { categorized: 0 }

  const outcome = await writePatches(repo, changes)
  settle(outcome, {
    message: updatedMessage,
    retry: (failed) => retryPatches(repo, changes, failed),
  })
  return { categorized: outcome.saved.length }
}

/**
 * Applies a just-created rule to existing rows (split parts keep their own
 * categories). Rows that saved stay applied, locally too; the rest are
 * counted as failed — Categorías reports "N de M".
 */
export async function applyPatternToPast(
  repo: Repository,
  pattern: CustomPattern
): Promise<{ updated: number; failed: number }> {
  assertOwner(repo)
  const targets = store().transactions.filter(
    (tx) => !tx.splitParentId && testPattern(tx.description, pattern)
  )
  if (targets.length === 0) return { updated: 0, failed: 0 }
  const patch: TransactionPatch = {
    category: pattern.category,
    categoryConfidence: 0.95,
    ...(pattern.description && { displayDescription: pattern.description }),
  }
  const outcome = await writePatches(
    repo,
    new Map(targets.map((tx) => [tx.id, patch]))
  )
  return {
    updated: outcome.saved.length,
    failed: outcome.failed.length + outcome.missing.length,
  }
}
