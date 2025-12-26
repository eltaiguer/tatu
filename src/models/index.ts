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

// Category system
export {
  Category,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  isExpenseCategory,
  isIncomeCategory,
  isTransferCategory,
  getAllCategories,
  getExpenseCategories,
} from './category'
