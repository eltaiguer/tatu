import type { ParsedData, FileType } from '../../models'
import { parseCreditCardCSV } from './credit-card-parser'
import { parseBankAccountCSV } from './bank-account-parser'

/**
 * Detect the type of Santander CSV file based on its content
 *
 * @param csvContent - Raw CSV content as string
 * @returns FileType detected from the CSV
 * @throws Error if file type cannot be detected
 */
export function detectFileType(csvContent: string): FileType {
  // Get first few lines for detection
  const firstLines = csvContent.split('\n').slice(0, 10).join('\n')

  // Check for credit card CSV - has unique identifiers in header
  // Using patterns that don't rely on special characters for robustness
  if (
    firstLines.includes('tarjeta de cr') ||
    (firstLines.includes('Tipo de producto') &&
      firstLines.includes('Fecha de corte'))
  ) {
    return 'credit_card'
  }

  // Check for bank account CSV - has "Moneda," followed by currency
  if (csvContent.includes('Moneda,USD')) {
    return 'bank_account_usd'
  }

  if (csvContent.includes('Moneda,UYU')) {
    return 'bank_account_uyu'
  }

  // Unable to detect file type
  throw new Error(
    'Unable to detect CSV file type. Expected Santander credit card or bank account format.'
  )
}

/**
 * Parse a Santander CSV file (auto-detects type and routes to appropriate parser)
 *
 * This is the main entry point for parsing any Santander CSV file.
 * It automatically detects whether it's a credit card or bank account statement,
 * and routes to the appropriate parser.
 *
 * @param csvContent - Raw CSV content as string
 * @param fileName - Name of the CSV file
 * @returns ParsedData with transactions and metadata
 * @throws Error if file type cannot be detected
 *
 * @example
 * ```typescript
 * const csvContent = readFileSync('statement.csv', 'utf-8')
 * const result = parseCSV(csvContent, 'statement.csv')
 * console.log(`Parsed ${result.transactions.length} transactions`)
 * ```
 */
export function parseCSV(csvContent: string, fileName: string): ParsedData {
  // Detect file type
  const fileType = detectFileType(csvContent)

  // Route to appropriate parser
  switch (fileType) {
    case 'credit_card':
      return parseCreditCardCSV(csvContent, fileName)

    case 'bank_account_usd':
    case 'bank_account_uyu':
      return parseBankAccountCSV(csvContent, fileName)

    default:
      // This should never happen due to detectFileType throwing
      throw new Error(`Unsupported file type: ${fileType}`)
  }
}
