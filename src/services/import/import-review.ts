// What an import leaves to review, counted the way the table it opens shows
// it (#275): through the Transacciones filter, never by re-deriving the rule.
import type { FileType, Transaction, TransactionsFilter } from '../../models'
import { currentHouseholdRules } from '../household/household'
import { filterTransactions } from '../filters/transaction-filter'
import { filterToSearch, parseFilterParams } from '../filters/url-filters'

export interface ReviewedFile {
  fileType: FileType
  /** ISO days of the oldest and newest row in the file. */
  fileRange: { from: string; to: string }
}

/**
 * The "Revisar N" link of an import: the rows to review across the files'
 * dates, on the files' account when they all share one (a card file does not
 * pull in older bank rows). Null without files.
 */
export function reviewLink(files: ReviewedFile[]): TransactionsFilter | null {
  if (files.length === 0) return null
  const from = files
    .map((f) => f.fileRange.from)
    .reduce((a, b) => (b < a ? b : a))
  const to = files.map((f) => f.fileRange.to).reduce((a, b) => (b > a ? b : a))
  const fileType = files[0].fileType
  const sameAccount = files.every((f) => f.fileType === fileType)
  const account: TransactionsFilter = !sameAccount
    ? {}
    : fileType === 'credit_card'
      ? { accountType: 'credit_card' }
      : {
          accountType: 'bank_account',
          currency: fileType === 'bank_account_usd' ? 'USD' : 'UYU',
        }
  return { review: true, ...account, period: { mode: 'range', from, to } }
}

/**
 * How many of `rows` the filter lists (and so how many its link opens),
 * optionally only among `onlyIds`. Rules and AI run after an import's rows
 * are classified, so this reads the stored rows, never the import result.
 */
export function countReviewRows(
  rows: Transaction[],
  filter: TransactionsFilter,
  onlyIds?: ReadonlySet<string>
): number {
  return filterTransactions(
    onlyIds ? rows.filter((row) => onlyIds.has(row.id)) : rows,
    parseFilterParams(filterToSearch(filter)),
    { householdRules: currentHouseholdRules() }
  ).length
}
