import type { Transaction } from '../../models'
import { countsAsRow } from '../spending/spending-rules'
import { normalizeCategoryId } from './category-aliases'

// Rows in a category, counted like any list of movements in the app (split
// parts in, split parents out). Category ids are compared by the id rows are
// grouped under, so aliases of the same category count together.
export function getCategoryTransactionCount(
  transactions: Transaction[],
  categoryId: string
): number {
  const target = normalizeCategoryId(categoryId)
  return transactions.filter(
    (tx) => countsAsRow(tx) && normalizeCategoryId(tx.category) === target
  ).length
}
