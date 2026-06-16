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

// Parsed data and metadata models
export type {
  FileType,
  CreditCardMetadata,
  BankAccountMetadata,
  ParsedData,
} from './parsed-data'

export type { ImportRun, ImportRunStatus } from './import-run'

export interface TransactionsFilter {
  category?: string
  accountType?: 'all' | 'credit_card' | 'bank_account'
  currency?: 'all' | 'USD' | 'UYU'
}
export type { CustomCategoryRecord } from './custom-category'

// Category system
export { Category, CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS } from './category'
