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
 * pull in older bank rows). It opens the review mode, one row at a time
 * (#305). Null without files.
 */
export function reviewLink(files: ReviewedFile[]): TransactionsFilter | null {
  if (files.length === 0) return null
  const from = files
    .map((f) => f.fileRange.from)
    .reduce((a, b) => (b < a ? b : a))
  const to = files.map((f) => f.fileRange.to).reduce((a, b) => (b > a ? b : a))
  const types = new Set(files.map((f) => f.fileType))
  const isBank = (t: FileType) => t !== 'credit_card'
  // One card statement scopes to the card; one bank statement to its account
  // and currency; bank statements of both currencies to the bank account
  // (never the card); cards mixed with banks leave only the period.
  let account: TransactionsFilter = {}
  if (types.size === 1) {
    const [fileType] = [...types]
    account =
      fileType === 'credit_card'
        ? { accountType: 'credit_card' }
        : {
            accountType: 'bank_account',
            currency: fileType === 'bank_account_usd' ? 'USD' : 'UYU',
          }
  } else if ([...types].every(isBank)) {
    account = { accountType: 'bank_account' }
  }
  return {
    review: true,
    reviewMode: true,
    ...account,
    period: { mode: 'range', from, to },
  }
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
