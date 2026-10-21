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
import { StatementReadError, UserFacingError } from '../../utils/user-error'

const UNREADABLE =
  'No se pudo leer el archivo. Revisá que sea un extracto CSV de Santander.'

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
   * Progress only: called once the file is read and understood, before
   * anything is written (the dialog then says "Importando…"). What failed is
   * told by the error's type, not by whether this ran.
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
 * A file it cannot read rejects with a `StatementReadError`: the parser's
 * own message (Spanish, says what to do), or for a crash a generic one with
 * the crash as `cause`. Anything else — a save failure, the session ended —
 * is whatever `importTransactions` throws.
 */
export async function importStatement(
  repo: Repository,
  file: StatementFile,
  { onParsed }: ImportStatementOptions = {}
): Promise<StatementImportResult> {
  const { csvContent, parsed } = readStatement(file)
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

function readStatement(file: StatementFile) {
  try {
    const csvContent = decodeCsvBytes(file.bytes)
    // Parsers are pure and return uncategorized rows; categorize before
    // anything else sees them (dedup, AI enrichment, the store).
    const parsed = categorizeParsedData(parseCSV(csvContent, file.fileName))
    return { csvContent, parsed }
  } catch (error) {
    // A crash may mean Santander changed its export format: kept as the
    // cause, so error reporting sends it.
    if (error instanceof UserFacingError) {
      throw new StatementReadError(error.message, { cause: error.cause })
    }
    throw new StatementReadError(UNREADABLE, { cause: error })
  }
}
