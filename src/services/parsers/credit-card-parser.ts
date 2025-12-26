import Papa from 'papaparse'
import type {
  ParsedData,
  CreditCardMetadata,
  Transaction,
  CreditCardTransaction,
} from '../../models'
import {
  parseSantanderNumber,
  parseSantanderDate,
  generateTransactionId,
} from './utils'
import { categorizeTransaction } from '../categorizer/transaction-categorizer'

/**
 * Parse a Santander credit card CSV file
 *
 * @param csvContent - Raw CSV content as string
 * @param fileName - Name of the CSV file
 * @returns ParsedData with transactions and metadata
 */
export function parseCreditCardCSV(
  csvContent: string,
  fileName: string
): ParsedData {
  // Parse CSV with PapaParse
  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    skipEmptyLines: false,
  })

  const rows = parsed.data

  // Extract metadata from header rows
  const metadata = extractMetadata(rows)

  // Find where transactions start (after "Movimientos," row)
  const transactionsStartIndex = findTransactionsStart(rows)

  // Parse transactions
  const transactions = parseTransactions(rows, transactionsStartIndex)

  return {
    fileType: 'credit_card',
    transactions,
    metadata,
    fileName,
    parsedAt: new Date(),
  }
}

/**
 * Extract metadata from credit card CSV header rows
 */
function extractMetadata(rows: string[][]): CreditCardMetadata {
  // Row 0: Cliente, Número de tarjeta de crédito, Alias, Tipo de producto, Fecha de corte, Fecha de vencimiento, Límite de crédito (US$), Límite de crédito ($)
  // Row 1: Values for above
  const headerRow1 = rows[1] || []

  // Row 3: Saldo del corte anterior (US$), Saldo del corte anterior ($), Pago mínimo (US$), Pago mínimo ($), Pago contado (US$), Pago contado ($)
  // Row 4: Values for above
  const balanceRow = rows[4] || []

  // Row 6: Monto vencido (US$), Monto vencido ($)
  // Row 7: Values for above
  const overdueRow = rows[7] || []

  // Row 9: Período
  // Row 10: Desde:, 01/12/2025, Hasta:, 31/12/2025
  const periodRow = rows[10] || []

  return {
    cliente: headerRow1[0] || '',
    numeroTarjeta: headerRow1[1] || '',
    alias: headerRow1[2] || '',
    tipoProducto: headerRow1[3] || '',
    fechaCorte: headerRow1[4] || '',
    fechaVencimiento: headerRow1[5] || '',
    limiteCreditoUSD: headerRow1[6] || '0,00',
    limiteCreditoUYU: headerRow1[7] || '0,00',
    saldoAnteriorUSD: balanceRow[0] || '0,00',
    saldoAnteriorUYU: balanceRow[1] || '0,00',
    pagoMinimoUSD: balanceRow[2] || '0,00',
    pagoMinimoUYU: balanceRow[3] || '0,00',
    pagoContadoUSD: balanceRow[4] || '0,00',
    pagoContadoUYU: balanceRow[5] || '0,00',
    montoVencidoUSD: overdueRow[0] || '0,00',
    montoVencidoUYU: overdueRow[1] || '0,00',
    periodoDesde: periodRow[1] || '',
    periodoHasta: periodRow[3] || '',
  }
}

/**
 * Find the index where transaction data starts
 * (the row after "Movimientos,")
 */
function findTransactionsStart(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'Movimientos') {
      // Transactions start 2 rows after "Movimientos," (skip header row)
      return i + 2
    }
  }
  return -1 // Not found
}

/**
 * Parse transaction rows into Transaction objects
 */
function parseTransactions(
  rows: string[][],
  startIndex: number
): Transaction[] {
  if (startIndex === -1 || startIndex >= rows.length) {
    return []
  }

  const transactions: Transaction[] = []

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]

    // Skip empty rows or rows with no date
    if (!row[0] || row[0].trim() === '') {
      continue
    }

    const rawTransaction: CreditCardTransaction = {
      fecha: row[0],
      numeroTarjeta: row[1] || '',
      numeroAutorizacion: row[2] || '',
      descripcion: row[3] || '',
      importeOriginal: row[4] || '0,00',
      pesos: row[5] || '0,00',
      dolares: row[6] || '0,00',
    }

    // Determine currency and amount
    const pesosAmount = parseSantanderNumber(rawTransaction.pesos)
    const dolaresAmount = parseSantanderNumber(rawTransaction.dolares)

    let amount: number
    let currency: 'USD' | 'UYU'

    // Determine currency based on which field has non-zero value
    if (Math.abs(dolaresAmount) > 0) {
      amount = Math.abs(dolaresAmount)
      currency = 'USD'
    } else {
      amount = Math.abs(pesosAmount)
      currency = 'UYU'
    }

    // Determine transaction type (debit or credit)
    // Negative amounts are credits (payments), positive are debits (charges)
    const isCredit =
      (currency === 'USD' && dolaresAmount < 0) ||
      (currency === 'UYU' && pesosAmount < 0)

    // Auto-categorize based on transaction details
    const { category, confidence } = categorizeTransaction(
      rawTransaction.descripcion,
      isCredit ? 'credit' : 'debit'
    )

    const transaction: Transaction = {
      id: generateTransactionId(
        rawTransaction.fecha,
        rawTransaction.descripcion,
        rawTransaction.pesos + rawTransaction.dolares,
        i - startIndex
      ),
      date: parseSantanderDate(rawTransaction.fecha),
      description: rawTransaction.descripcion,
      amount,
      currency,
      type: isCredit ? 'credit' : 'debit',
      source: 'credit_card',
      category,
      categoryConfidence: confidence,
      rawData: rawTransaction,
    }

    transactions.push(transaction)
  }

  return transactions
}
