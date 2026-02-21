/**
 * Currency types supported by Santander Uruguay
 */
export type Currency = 'USD' | 'UYU'

/**
 * Transaction type - debit (expense) or credit (income)
 */
export type TransactionType = 'debit' | 'credit'

/**
 * Source of the transaction data
 */
export type TransactionSource = 'credit_card' | 'bank_account'

/**
 * Unified transaction interface - normalized from different CSV formats
 */
export interface Transaction {
  /** Unique identifier for the transaction */
  id: string

  /** Transaction date */
  date: Date

  /** Transaction description/merchant name */
  description: string

  /** Transaction amount (always positive, type determines debit/credit) */
  amount: number

  /** Currency of the transaction */
  currency: Currency

  /** Type of transaction (debit = expense, credit = income) */
  type: TransactionType

  /** Source of the transaction data */
  source: TransactionSource

  /** Inferred or manually assigned category (optional) */
  category?: string

  /** User-defined tags for filtering and organization (optional) */
  tags?: string[]

  /** Confidence score for auto-categorization (0-1, optional) */
  categoryConfidence?: number

  /** Account balance after this transaction (optional, from bank accounts) */
  balance?: number

  /** Reference to the original raw data */
  rawData:
    | CreditCardTransaction
    | BankAccountTransaction
    | Record<string, unknown>
}

/**
 * Credit Card Transaction - Raw format from Santander CSV
 * Corresponds to CreditCardsMovementsDetail.csv format
 */
export interface CreditCardTransaction {
  /** Date in DD/MM/YYYY format */
  fecha: string

  /** Masked card number (e.g., XXXXX-4362) */
  numeroTarjeta: string

  /** Authorization number */
  numeroAutorizacion: string

  /** Transaction description/merchant */
  descripcion: string

  /** Original amount (may be in foreign currency), format: "1.234,56" */
  importeOriginal: string

  /** Amount in UYU pesos, format: "1.234,56" */
  pesos: string

  /** Amount in USD dollars, format: "1.234,56" */
  dolares: string
}

/**
 * Bank Account Transaction - Raw format from Santander CSV
 * Corresponds to USDmovements.csv and UYUmovements.csv formats
 */
export interface BankAccountTransaction {
  /** Date in DD/MM/YYYY format */
  fecha: string

  /** Transaction reference number */
  referencia: string

  /** Transaction concept/type */
  concepto: string

  /** Transaction description */
  descripcion: string

  /** Debit amount (expense), format: "123.45" or "1234.56" */
  debito: string

  /** Credit amount (income), format: "123.45" or "1234.56" */
  credito: string

  /** Account balance after transaction, format: "12345.67" */
  saldos: string
}
