// The persistence port (#119). Everything Tatu reads from or writes to its
// store of record goes through a `Repository` bound to one signed-in user.
// Two adapters implement it: `supabase-repository.ts` (production) and
// `in-memory-repository.ts` (tests). Batching — how a large write is cut
// into requests — is the adapters' concern (`batching.ts`), not the callers'.
import type { Transaction } from '../../models'
import { UserFacingError } from '../../utils/user-error'
import type { ExistingTransaction } from '../dedup/import-dedup'
import type { CategoryOverrideRecord } from '../supabase/category-overrides'
import type { DescriptionOverrideRecord } from '../supabase/description-overrides'
import type { CustomCategoryRecord } from '../supabase/custom-categories'
import type { UserPreferences } from '../supabase/user-preferences'
import type { CustomPattern } from '../categorizer/custom-patterns'

/**
 * One change to one row, written once and applied to both the repository and
 * the in-memory store (`applyPatch`), so the two can't disagree.
 *
 * A key that is absent (or `undefined`) leaves the field alone; `null`
 * clears it. There is no other convention anywhere.
 */
export interface TransactionPatch {
  displayDescription?: string | null
  category?: string | null
  categoryConfidence?: number | null
  tags?: string[]
}

const PATCH_KEYS = [
  'displayDescription',
  'category',
  'categoryConfidence',
  'tags',
] as const

/** The store side of a patch: same keys, same clear-with-null rule. */
export function applyPatch(
  tx: Transaction,
  patch: TransactionPatch
): Transaction {
  const next: Transaction = { ...tx }
  for (const key of PATCH_KEYS) {
    const value = patch[key]
    if (value === undefined) continue
    if (value === null) delete next[key]
    else (next as unknown as Record<string, unknown>)[key] = value
  }
  return next
}

export function isEmptyPatch(patch: TransactionPatch): boolean {
  return PATCH_KEYS.every((key) => patch[key] === undefined)
}

/**
 * What a chunked write did, per id:
 * - `saved`: the server confirmed the change.
 * - `failed`: the request for its chunk failed; retrying may work.
 * - `missing`: its chunk succeeded but the row wasn't there (deleted on
 *   another device). Retrying won't help.
 * `error` is the first chunk error, if any.
 */
export interface WriteOutcome {
  saved: string[]
  failed: string[]
  missing: string[]
  error?: unknown
}

/** Everything a user has stored, as `hydrateWorkspace` needs it. */
export interface WorkspaceSnapshot {
  transactions: Transaction[]
  categoryOverrides: CategoryOverrideRecord[]
  descriptionOverrides: DescriptionOverrideRecord[]
  customPatterns: CustomPattern[]
  customCategories: CustomCategoryRecord[]
  /** null: the user never saved preferences. */
  preferences: UserPreferences | null
}

export type ImportFileType =
  | 'credit_card'
  | 'bank_account_usd'
  | 'bank_account_uyu'

export const SESSION_ENDED_MESSAGE =
  'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'

/**
 * The one contract for a write without a signed-in user: it is refused, the
 * same way everywhere.
 */
export function requireRepository<R>(repository: R | null | undefined): R {
  if (!repository) throw new UserFacingError(SESSION_ENDED_MESSAGE)
  return repository
}

/** A split refused because the parent was split or deleted elsewhere. */
export const SPLIT_CONFLICT_MESSAGE =
  'Esta transacción ya no se puede dividir (¿se dividió o eliminó en otro dispositivo?). Recargá para ver el estado actual.'

/**
 * A split saved its parts but could not mark the parent, and undoing the parts
 * failed too (#60): the server may hold the parent unmarked next to live parts
 * (both visible, so the user can delete the parts).
 */
export class SplitIncompleteError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'SplitIncompleteError'
  }
}

/**
 * An unsplit unmarked the parent but could not delete the parts, nor mark the
 * parent again: the server holds the parent unmarked next to live parts (both
 * visible).
 */
export class UnsplitIncompleteError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'UnsplitIncompleteError'
  }
}

export interface Repository {
  /** The user every read and write is scoped to. */
  readonly userId: string

  loadWorkspace(): Promise<WorkspaceSnapshot>
  savePreferences(preferences: UserPreferences): Promise<void>

  // Transactions --------------------------------------------------------
  /** Stored rows an import is deduplicated against (#57), live or deleted. */
  findImportCandidates(incoming: Transaction[]): Promise<ExistingTransaction[]>
  /** Which of `ids` exist, split by whether the user deleted them. */
  findExistingIds(
    ids: string[]
  ): Promise<{ active: Set<string>; deleted: Set<string> }>
  /**
   * Inserts new rows (never overwrites) in sequential chunks, stopping at the
   * first chunk that fails, or before a chunk when `shouldContinue` says no.
   * `saved` is exactly the committed rows.
   */
  insertTransactions(
    rows: Transaction[],
    options?: { importId?: string; shouldContinue?: () => boolean }
  ): Promise<{ saved: Transaction[]; error?: unknown }>
  /** Applies each row's patch; atomic per chunk, every chunk attempted. */
  updateTransactions(
    changes: ReadonlyMap<string, TransactionPatch>
  ): Promise<WriteOutcome>
  softDeleteTransactions(ids: string[]): Promise<WriteOutcome>
  restoreTransactions(ids: string[]): Promise<WriteOutcome>
  /** Removes rows for good (split parts only). */
  hardDeleteTransactions(ids: string[]): Promise<WriteOutcome>
  /**
   * Saves `parts`, then marks `parent` split (only if it is live and not split
   * yet). If the mark fails the parts are removed again; if that fails too,
   * throws SplitIncompleteError. A parent already split or deleted elsewhere
   * rejects with a UserFacingError (after removing the parts it wrote). Never
   * leaves a split parent without parts.
   */
  splitTransaction(parent: Transaction, parts: Transaction[]): Promise<void>
  /**
   * Unmarks `parent`, then deletes every part pointing at it. If the parts
   * can't be deleted the parent is marked again; if that fails too, throws
   * UnsplitIncompleteError. Never leaves a split parent without parts.
   */
  unsplitTransaction(parent: Transaction): Promise<void>

  // Import audit ----------------------------------------------------------
  createImportRun(input: {
    fileName: string
    fileType: ImportFileType
    fileChecksum: string
  }): Promise<string>
  completeImportRun(
    importId: string,
    stats: { totalRows: number; insertedRows: number; duplicateRows: number }
  ): Promise<void>
  failImportRun(importId: string, errorMessage: string): Promise<void>

  // Rules -----------------------------------------------------------------
  upsertDescriptionOverride(input: {
    descriptionNormalized: string
    descriptionOriginal?: string
    friendlyDescription: string
    category?: string
  }): Promise<void>
  deleteDescriptionOverride(descriptionNormalized: string): Promise<void>
  upsertCategoryOverride(input: {
    merchantNormalized: string
    merchantOriginal?: string
    category: string
  }): Promise<void>
  deleteCategoryOverride(merchantNormalized: string): Promise<void>
  upsertCustomPattern(pattern: CustomPattern): Promise<void>
  deleteCustomPattern(id: string): Promise<void>
  upsertCustomCategory(input: {
    id: string
    label: string
    color: string
    icon?: string
    isIgnored?: boolean
    isArchived?: boolean
  }): Promise<void>
  archiveCustomCategory(id: string): Promise<void>
}
