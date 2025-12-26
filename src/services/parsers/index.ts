/**
 * Parsers module - CSV parsers for Santander Uruguay bank statements
 *
 * This module provides parsers for:
 * - Credit card statements
 * - USD bank account statements
 * - UYU bank account statements
 *
 * The main entry point is the `parseCSV` function which automatically
 * detects the file type and routes to the appropriate parser.
 */

// Main unified parser (recommended)
export { parseCSV, detectFileType } from './csv-parser'

// Individual parsers (for advanced use cases)
export { parseCreditCardCSV } from './credit-card-parser'
export { parseBankAccountCSV } from './bank-account-parser'

// Utilities
export {
  parseSantanderNumber,
  parseSantanderDate,
  generateTransactionId,
} from './utils'
