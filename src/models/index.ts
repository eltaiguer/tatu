/**
 * Models module - TypeScript interfaces for Tatu expense tracker
 * Designed for Santander Uruguay CSV formats
 */

// Transaction models
export type {
  Currency,
  TransactionType,
  TransactionSource,
  Transaction,
  CreditCardTransaction,
  BankAccountTransaction,
} from './transaction'
export { isSplitParentTx, isSplitChildTx } from './transaction'

// Parsed data and metadata models
export type {
  FileType,
  CreditCardMetadata,
  BankAccountMetadata,
  ParsedData,
} from './parsed-data'

export type { ImportRun, ImportRunStatus } from './import-run'

// A period in Transacciones' period picker (m is 0-based).
export type UrlPeriod =
  | { mode: 'month'; y: number; m: number }
  | { mode: 'recent'; n: number }
  | { mode: 'all' }
  | { mode: 'range'; from: string; to: string }

// A link into Transacciones from another view. A drill-through must land on
// exactly the rows behind the number clicked, so it carries everything that
// number was computed from (categories, merchant, type, period…).
export interface TransactionsFilter {
  category?: string
  categories?: string[]
  merchant?: string
  accountType?: 'all' | 'credit_card' | 'bank_account'
  currency?: 'all' | 'USD' | 'UYU'
  type?: 'credit' | 'debit'
  period?: UrlPeriod
}
export type { CustomCategoryRecord } from './custom-category'

// Category system
export {
  Category,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
} from './category'
