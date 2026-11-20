import { Category, type Currency, type Transaction } from '../../models'
import { normalizeCategoryId } from '../categories/category-aliases'
import { convert } from '../currency/convert'
import { findSimilarTransactions } from '../descriptions/similar-transactions'
import { countsTowardTotals } from '../spending/spending-rules'
import { needsCategoryReview } from '../../utils/transaction-display'

/**
 * A row's amount in the home currency: THE conversion of the review mode (the
 * queue order, the done total and the card's "≈" line all call it).
 */
export function toHome(
  tx: Transaction,
  homeCurrency: Currency,
  fxRate: number
): number {
  return convert(tx.amount, tx.currency as Currency, homeCurrency, fxRate)
}

/**
 * The ids of `rows` for the review mode: expenses first, then credits, each
 * biggest home-currency amount first.
 * Ties go by date (newest first), then id. A snapshot: callers take it once.
 */
export function buildReviewQueue(
  rows: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): string[] {
  return rows
    .map((tx) => ({ tx, home: toHome(tx, homeCurrency, fxRate) }))
    .sort(
      (a, b) =>
        // Expenses first: the review is about where the money went, so a big
        // uncategorized credit (a salary) waits behind the spend.
        Number(a.tx.type === 'credit') - Number(b.tx.type === 'credit') ||
        b.home - a.home ||
        b.tx.date.getTime() - a.tx.date.getTime() ||
        (a.tx.id < b.tx.id ? -1 : a.tx.id > b.tx.id ? 1 : 0)
    )
    .map(({ tx }) => tx.id)
}

/**
 * The category worth offering first for a row under review: its own
 * low-confidence category, else the most frequent one among its similar rows
 * that need no review (ties: category id ascending), else none.
 */
export function reviewSuggestion(
  row: Transaction,
  all: Transaction[]
): string | null {
  const own = normalizeCategoryId(row.category)
  if (own !== Category.Uncategorized) return own
  const votes = new Map<string, number>()
  for (const other of findSimilarTransactions(all, row)) {
    if (
      other.id === row.id ||
      !countsTowardTotals(other) ||
      needsCategoryReview(other)
    ) {
      continue
    }
    const category = normalizeCategoryId(other.category)
    votes.set(category, (votes.get(category) ?? 0) + 1)
  }
  let best: string | null = null
  let bestVotes = 0
  for (const [category, count] of votes) {
    if (count > bestVotes || (count === bestVotes && category < (best ?? ''))) {
      best = category
      bestVotes = count
    }
  }
  return best
}
