import type { Transaction } from '../../models'
import { countsAsRow } from '../spending/spending-rules'
import { getCategoryDisplay } from '../../utils/category-display'

// Rows in a category, counted like any list of movements in the app (split
// parts in, split parents out). Category ids are compared by their display
// id, so aliases of the same category count together.
export function getCategoryTransactionCount(
  transactions: Transaction[],
  categoryId: string
): number {
  return transactions.filter((tx) => {
    if (!countsAsRow(tx)) return false
    const txCat = getCategoryDisplay(tx.category).id
    const defCat = getCategoryDisplay(categoryId).id
    return txCat === defCat
  }).length
}
