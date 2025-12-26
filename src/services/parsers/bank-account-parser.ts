import Papa from 'papaparse'
import type {
  ParsedData,
  BankAccountMetadata,
  Transaction,
  BankAccountTransaction,
  FileType,
} from '../../models'
import {
  parseSantanderNumber,
  parseSantanderDate,
  generateTransactionId,
} from './utils'
import { getMerchantCategory } from '../categorizer/merchant-patterns'

/**
 * Parse a Santander bank account CSV file (USD or UYU)
 *
 * @param csvContent - Raw CSV content as string
 * @param fileName - Name of the CSV file
 * @returns ParsedData with transactions and metadata
 */
export function parseBankAccountCSV(
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

  // Determine file type based on currency
  const fileType: FileType =
    metadata.moneda === 'USD' ? 'bank_account_usd' : 'bank_account_uyu'

  // Find where transactions start (after "Movimientos," row)
  const transactionsStartIndex = findTransactionsStart(rows)

  // Parse transactions
  const transactions = parseTransactions(
    rows,
    transactionsStartIndex,
    metadata.moneda as 'USD' | 'UYU'
  )

  return {
    fileType,
    transactions,
    metadata,
    fileName,
    parsedAt: new Date(),
  }
}

/**
 * Extract metadata from bank account CSV header rows
 */
function extractMetadata(rows: string[][]): BankAccountMetadata {
  // Row 0: Cliente, <name>
  // Row 1: Cuenta, <account type>
  // Row 2: Número, <account number>
  // Row 3: Moneda, <currency>
  // Row 4: Sucursal, <branch>
  // Row 5: empty
  // Row 6: Movimientos,
  // Row 7: Desde:, <date>, Hasta:, <date>

  return {
    cliente: rows[0]?.[1] || '',
    cuenta: rows[1]?.[1] || '',
    numero: rows[2]?.[1] || '',
    moneda: rows[3]?.[1] || '',
    sucursal: rows[4]?.[1] || '',
    periodoDesde: rows[7]?.[1] || '',
    periodoHasta: rows[7]?.[3] || '',
  }
}

/**
 * Find the index where transaction data starts
 * (the row after "Movimientos,")
 */
function findTransactionsStart(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'Fecha' && rows[i][1] === 'Referencia') {
      // Transactions start in the next row
      return i + 1
    }
  }
  return -1 // Not found
}

/**
 * Parse transaction rows into Transaction objects
 */
function parseTransactions(
  rows: string[][],
  startIndex: number,
  currency: 'USD' | 'UYU'
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

    const rawTransaction: BankAccountTransaction = {
      fecha: row[0],
      referencia: row[1] || '',
      concepto: row[2] || '',
      descripcion: row[3] || '',
      debito: row[4] || '',
      credito: row[5] || '',
      saldos: row[6] || '',
    }

    // Determine amount and type based on debito/credito
    const debitoAmount = parseSantanderNumber(rawTransaction.debito)
    const creditoAmount = parseSantanderNumber(rawTransaction.credito)

    let amount: number
    let type: 'debit' | 'credit'

    // Debito amounts are negative in the CSV, credito amounts are positive
    // Check which field has a value (non-empty)
    if (rawTransaction.debito && rawTransaction.debito.trim() !== '') {
      amount = Math.abs(debitoAmount)
      type = 'debit'
    } else {
      amount = Math.abs(creditoAmount)
      type = 'credit'
    }

    // Parse balance
    const balance = parseSantanderNumber(rawTransaction.saldos)

    // Combine concepto and descripcion for description
    const description = [rawTransaction.concepto, rawTransaction.descripcion]
      .filter((s) => s && s.trim() !== '')
      .join(' ')
      .trim()

    // Auto-categorize based on description
    const { category, confidence } = getMerchantCategory(description)

    const transaction: Transaction = {
      id: generateTransactionId(
        rawTransaction.fecha,
        description,
        rawTransaction.debito + rawTransaction.credito,
        i - startIndex
      ),
      date: parseSantanderDate(rawTransaction.fecha),
      description,
      amount,
      currency,
      type,
      source: 'bank_account',
      balance,
      category,
      categoryConfidence: confidence,
      rawData: rawTransaction,
    }

    transactions.push(transaction)
  }

  return transactions
}
