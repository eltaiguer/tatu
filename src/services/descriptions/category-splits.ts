import { Category } from '../../models'
import type { Transaction } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import { resolveCategory } from '../categories/category-registry'
import { countsAsRow } from '../spending/spending-rules'
import { isTransferCategory } from '../transfers/internal-transfers'
import { buildDescriptionOverrideKey } from './normalization'

// THE "is this merchant split across categories?" rule (≠ hint, the dialog's
// offer). Same key as findSimilarTransactions, so "Aplicar a las N similares"
// makes the split go away. Pure in the rows (no registry reads): a memo over
// the transactions can't go stale.
export interface CategorySplit {
  // Rows of the group in a category other than this row's.
  readonly others: number
  // Those rows per (normalized) category id, most rows first, ties by id.
  readonly categories: ReadonlyArray<{
    readonly category: string
    readonly count: number
  }>
}

// Every row whose similar rows are in more than one category, by row id.
// Left out (neither counted nor given an entry): credits (a refund in Ingresos
// must not flag every purchase), split parents and parts,
// Sin categoría rows, and transfer rows (their category is set per row by
// the pairing in inferInternalTransfers, not per merchant).
export function findCategorySplits(
  all: readonly Transaction[]
): ReadonlyMap<string, CategorySplit> {
  const groups = new Map<string, Array<{ id: string; category: string }>>()
  for (const tx of all) {
    if (!countsAsRow(tx) || tx.splitParentId || tx.type !== 'debit') continue
    const key = buildDescriptionOverrideKey(tx.description)
    if (key === null) continue
    const category = normalizeCategoryId(tx.category)
    if (category === Category.Uncategorized || isTransferCategory(category)) {
      continue
    }
    const group = groups.get(key)
    if (group) group.push({ id: tx.id, category })
    else groups.set(key, [{ id: tx.id, category }])
  }

  const splits = new Map<string, CategorySplit>()
  for (const group of groups.values()) {
    const perCategory = new Map<string, number>()
    for (const row of group) {
      perCategory.set(row.category, (perCategory.get(row.category) ?? 0) + 1)
    }
    if (perCategory.size < 2) continue
    for (const row of group) {
      const categories = [...perCategory]
        .filter(([category]) => category !== row.category)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1))
      splits.set(row.id, {
        others: group.length - (perCategory.get(row.category) ?? 0),
        categories,
      })
    }
  }
  return splits
}

// "Otra de X está en A" / "Otras N de X están en A (a) y B (b)".
export function categorySplitLine(
  split: CategorySplit,
  merchant: string
): string {
  const { categories, others } = split
  if (categories.length === 1) {
    const where = resolveCategory(categories[0].category).label
    return others === 1
      ? `Otra de ${merchant} está en ${where}`
      : `Otras ${others} de ${merchant} están en ${where}`
  }
  const parts = categories.map(
    ({ category, count }) => `${resolveCategory(category).label} (${count})`
  )
  const joined = `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
  return `Otras ${others} de ${merchant} están en ${joined}`
}
