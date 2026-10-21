// The import pipeline, behind one function: a Santander statement file in,
// its rows saved for the signed-in user out. The import dialog only picks the
// file and reports the outcome; every step between lives here or below.
import type { FileType } from '../../models'
import type { Repository } from '../repository/repository'
import { decodeCsvBytes } from '../parsers/decode-csv'
import { parseCSV } from '../parsers/csv-parser'
import { categorizeParsedData } from '../categorizer/import-categorization'
import {
  importTransactions,
  type ImportResult,
} from '../mutations/transaction-mutations'
import { newestDataMonth } from '../../utils/date-utils'

/** A statement as the user picked it: raw bytes, encoding unknown (#192). */
export interface StatementFile {
  bytes: ArrayBuffer | Uint8Array
  fileName: string
}

export interface StatementImportResult extends ImportResult {
  /** Which of the three Santander exports the file was. */
  fileType: FileType
  /**
   * The month to show the import in: the newest new row's, or the file's
   * newest when nothing was new. Null only for a statement without rows.
   */
  month: { y: number; m: number } | null
}

export interface ImportStatementOptions {
  /**
   * Called once the file is read and understood, before anything is written.
   * A rejection before it is a file the import could not read (wrong format,
   * a parser bug); a rejection after it is a failure to save.
   */
  onParsed?: () => void
}

/**
 * Imports a statement file: decodes it (UTF-8, else windows-1252, #192),
 * parses it (any of the three Santander formats), categorizes its rows, then
 * hands them to `importTransactions` — classified against the server by
 * content (#57), AI-enriched when enabled, inserted, recorded as an import
 * run, and rows stored garbled repaired in place.
 *
 * Parser errors are `UserFacingError`s (Spanish, say what to do); a save
 * failure is whatever `importTransactions` throws.
 */
export async function importStatement(
  repo: Repository,
  file: StatementFile,
  { onParsed }: ImportStatementOptions = {}
): Promise<StatementImportResult> {
  const csvContent = decodeCsvBytes(file.bytes)
  // Parsers are pure and return uncategorized rows; categorize before
  // anything else sees them (dedup, AI enrichment, the store).
  const parsed = categorizeParsedData(parseCSV(csvContent, file.fileName))
  onParsed?.()

  const result = await importTransactions(repo, parsed.transactions, {
    parsedData: parsed,
    csvContent,
    fileName: file.fileName,
  })

  return {
    ...result,
    fileType: parsed.fileType,
    month: newestDataMonth(
      result.added.length > 0 ? result.added : parsed.transactions
    ),
  }
}
