import type { Transaction } from '../../models'
import { buildDescriptionOverrideKey } from './normalization'

// The rows an apply-scope edit treats as "the same merchant": same normalized
// description key. Shared by the write (useTransactionHandlers) and the
// count shown in the edit dialog, so the preview can't drift from the write.
// A description with no usable key only matches itself.
export function findSimilarTransactions(
  all: Transaction[],
  target: Transaction
): Transaction[] {
  const key = buildDescriptionOverrideKey(target.description)
  if (key === null) {
    return all.filter((tx) => tx.id === target.id)
  }
  return all.filter((tx) => buildDescriptionOverrideKey(tx.description) === key)
}
