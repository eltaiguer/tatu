import type { Transaction } from './transaction'

/**
 * Type of CSV file being parsed
 */
export type FileType = 'credit_card' | 'bank_account_usd' | 'bank_account_uyu'

/**
 * Credit Card Statement Metadata - from Santander credit card CSV
 */
export interface CreditCardMetadata {
  /** Client name */
  cliente: string

  /** Masked card number */
  numeroTarjeta: string

  /** Card alias/name */
  alias: string

  /** Product type (e.g., "Tarjeta de crédito") */
  tipoProducto: string

  /** Statement closing date (DD/MM/YYYY) */
  fechaCorte: string

  /** Payment due date (DD/MM/YYYY) */
  fechaVencimiento: string

  /** Credit limit in USD, format: "1.234,56" */
  limiteCreditoUSD: string

  /** Credit limit in UYU, format: "1.234,56" */
  limiteCreditoUYU: string

  /** Previous balance in USD, format: "1.234,56" */
  saldoAnteriorUSD: string

  /** Previous balance in UYU, format: "1.234,56" */
  saldoAnteriorUYU: string

  /** Minimum payment in USD, format: "1.234,56" */
  pagoMinimoUSD: string

  /** Minimum payment in UYU, format: "1.234,56" */
  pagoMinimoUYU: string

  /** Full payment in USD, format: "1.234,56" */
  pagoContadoUSD: string

  /** Full payment in UYU, format: "1.234,56" */
  pagoContadoUYU: string

  /** Overdue amount in USD, format: "1.234,56" */
  montoVencidoUSD: string

  /** Overdue amount in UYU, format: "1.234,56" */
  montoVencidoUYU: string

  /** Statement period start date (DD/MM/YYYY) */
  periodoDesde: string

  /** Statement period end date (DD/MM/YYYY) */
  periodoHasta: string
}

/**
 * Bank Account Statement Metadata - from Santander bank account CSV
 */
export interface BankAccountMetadata {
  /** Client name */
  cliente: string

  /** Account type (e.g., "Ca De Ahorro Atm") */
  cuenta: string

  /** Account number */
  numero: string

  /** Currency (USD or UYU) */
  moneda: string

  /** Branch name */
  sucursal: string

  /** Statement period start date (DD/MM/YYYY) */
  periodoDesde: string

  /** Statement period end date (DD/MM/YYYY) */
  periodoHasta: string
}

/**
 * Result of parsing a CSV file
 */
export interface ParsedData {
  /** Type of file that was parsed */
  fileType: FileType

  /** List of normalized transactions */
  transactions: Transaction[]

  /** Metadata extracted from the file */
  metadata: CreditCardMetadata | BankAccountMetadata

  /** Original file name */
  fileName: string

  /** When the file was parsed */
  parsedAt: Date

  /** Any errors encountered during parsing (optional) */
  errors?: string[]
}
