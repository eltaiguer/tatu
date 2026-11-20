import { Category } from '../../models'
import type { Transaction } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import { isTransferCategory } from '../transfers/internal-transfers'
import {
  countSimilarEditReach,
  findSimilarTransactions,
} from './similar-transactions'

// Whether the edit dialog opens a category change on "Todas las similares"
// (#281). Conservative, because that scope stamps the category at confidence 1
// on every similar row and a save has no Deshacer: only when the category
// changed to a real one, no transfer category is involved (stamping a
// transfer stops its pairing from ever re-marking it), no similar row is a
// split parent, no other similar row holds a hand-set (confidence 1, or none recorded)
// different category and none is a refund (credit) in another category, and the write reaches another row. The post-save offer covers the
// rest.
export function defaultsToAllSimilar(
  rows: readonly Transaction[],
  transaction: Transaction,
  category: string
): boolean {
  const next = normalizeCategoryId(category)
  const previous = normalizeCategoryId(transaction.category)
  if (
    next === Category.Uncategorized ||
    next === previous ||
    isTransferCategory(next) ||
    isTransferCategory(previous)
  ) {
    return false
  }
  const similar = findSimilarTransactions([...rows], transaction)
  const blocked = similar.some((row) => {
    const own = normalizeCategoryId(row.category)
    if (row.isSplitParent || isTransferCategory(own)) return true
    if (row.id === transaction.id || own === next) return false
    // A refund in another category (Ingresos) is not stamped by default; a
    // categorized row with no confidence (legacy) may be hand-set, like
    // needsCategoryReview treats it.
    const handSet =
      row.categoryConfidence === 1 ||
      (row.categoryConfidence == null && own !== Category.Uncategorized)
    return row.type === 'credit' || handSet
  })
  return !blocked && countSimilarEditReach([...rows], transaction, false) > 1
}
