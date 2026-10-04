import type { Currency, Transaction } from '../../models'
import { isSplitParentTx } from '../../models'
import { isCategoryIgnored } from '../categories/category-registry'
import { convert } from '../currency/convert'

// The one place that decides which rows count. Every list, count and money
// total in the app goes through these, so a number the user clicks equals
// the sum of the rows it opens. A new exclusion (e.g. card payments) is added
// here, not at the call sites.

// A row that stands for itself in lists and counts: every row except a split
// parent, which is an inert container its parts stand for. Rows in an
// ignored category are still movement rows (listed, counted per category,
// shown with "show ignored") — they just don't add to money totals.
export function isMovementRow(tx: Transaction): boolean {
  return !isSplitParentTx(tx)
}

// Counted in every income, expense and net total: a movement row whose
// category is not ignored (transfers, the legacy 'ignored' id, or any
// category the user flagged "Ignorar en totales").
export function countsTowardTotals(tx: Transaction): boolean {
  return isMovementRow(tx) && !isCategoryIgnored(tx.category)
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
