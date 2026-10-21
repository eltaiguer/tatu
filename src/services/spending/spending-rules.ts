import type { Currency, Transaction } from '../../models'
import { isSplitParentTx } from '../../models'
import { isCategoryIgnored } from '../categories/category-registry'
import { convert } from '../currency/convert'

// The one place that decides which rows count. Every list, count and money
// total in the app goes through these, so a number the user clicks equals
// the sum of the rows it opens. A new exclusion (e.g. card payments) is added
// here, not at the call sites.
//
// Not pure in `tx` alone: whether a category is ignored is read from the
// user's category settings (category-registry). Memoize on those too, not
// only on the transactions — see Categorías' categoriesVersion.

// Counts as a row of its own in lists and row counts: every row except a
// split parent, an inert container its parts stand for. Rows in an ignored
// category still count as rows (listed, counted per category, shown with
// "show ignored") — they just don't add to money totals.
export function countsAsRow(tx: Transaction): boolean {
  return !isSplitParentTx(tx)
}

// Counted in every income, expense and net total: a row whose category is
// not ignored (transfers, the legacy 'ignored' id, or any category the user
// flagged "Ignorar en totales"). Transacciones hides the rows that fail this
// unless "show ignored" is on, so a future exclusion lands there too.
export function countsTowardTotals(tx: Transaction): boolean {
  return countsAsRow(tx) && !isCategoryIgnored(tx.category)
}

export function isCountedExpense(tx: Transaction): boolean {
  return tx.type === 'debit' && countsTowardTotals(tx)
}

export function isCountedIncome(tx: Transaction): boolean {
  return tx.type === 'credit' && countsTowardTotals(tx)
}

export interface CountedTotals {
  income: number
  expense: number
  net: number
}

// Income, expense and net of the rows that count, in the home currency.
// `type` is 'debit' | 'credit', so every counted row lands in one of the two.
export function sumCountedTotals(
  rows: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CountedTotals {
  let income = 0
  let expense = 0
  for (const tx of rows) {
    if (!countsTowardTotals(tx)) continue
    const value = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.type === 'credit') income += value
    else if (tx.type === 'debit') expense += value
  }
  return { income, expense, net: income - expense }
}
