import type { Transaction } from '../../models'
import { buildDescriptionOverrideKey } from './normalization'

// The rows an apply-scope edit treats as "the same merchant": same normalized
// description key. Shared by the write (useTransactionHandlers) and the
// count shown in the edit dialog, so the preview can't drift from the write.
// A description with no usable key only matches itself.
//
// Split rows never count as "similar" to something else: a split's parts
// inherit the parent's description, and applying one category to all of
// them would erase the per-part categories the split exists for (the parent
// itself is excluded from totals).
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
      (!tx.isSplitParent &&
        !tx.splitParentId &&
        buildDescriptionOverrideKey(tx.description) === key)
  )
}
