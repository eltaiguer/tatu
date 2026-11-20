import type { Transaction } from '../../models'
import { isOriginalName } from '../merchants/merchant-key'
import { getDescriptionOverride } from './description-overrides'
import { buildDescriptionOverrideKey } from './normalization'

// The rows an apply-to-similar edit writes: same normalized description key.
// Shared by the write (useTransactionHandlers) and the dialog, so the preview
// can't drift from the save. A description with no usable key only matches
// itself.
//
// Split parts are left out (unless edited directly): they inherit the
// parent's description, and one category for all of them would erase the
// per-part categories the split exists for. Split parents stay in, so an
// unsplit doesn't bring back a row that disagrees with its siblings.
export function findSimilarTransactions(
  all: Transaction[],
  target: Transaction
): Transaction[] {
  const key = buildDescriptionOverrideKey(target.description)
  if (key === null) {
    return all.filter((tx) => tx.id === target.id)
  }
  return all.filter(
    (tx) =>
      tx.id === target.id ||
      (!tx.splitParentId && buildDescriptionOverrideKey(tx.description) === key)
  )
}

// How many rows an apply-to-similar edit visibly changes: the rows it writes,
// plus — when it renames — the split parts that show the merchant-wide name
// because they have none of their own.
export function countSimilarEditReach(
  all: Transaction[],
  target: Transaction,
  renamed: boolean
): number {
  const written = findSimilarTransactions(all, target)
  if (!renamed) {
    return written.length
  }
  const key = buildDescriptionOverrideKey(target.description)
  const writtenIds = new Set(written.map((tx) => tx.id))
  const namedParts = all.filter(
    (tx) =>
      key !== null &&
      tx.splitParentId &&
      !writtenIds.has(tx.id) &&
      !tx.displayDescription &&
      buildDescriptionOverrideKey(tx.description) === key
  )
  return written.length + namedParts.length
}

// Whether a save that gives `name` (null: untouched, none given) reaches the
// split parts that show the merchant-wide name (#296): a real rename does, and
// so does the original name when a description override exists (deleting it
// changes what those parts show). THE rule shared by the dialog's N and the
// count editTransaction returns; read it before the write deletes the override.
export function reachesNamedParts(
  target: Transaction,
  name: string | null
): boolean {
  const given = name?.trim()
  if (!given) return false
  return (
    !isOriginalName(given, target.description) ||
    getDescriptionOverride(target.description) !== null
  )
}
