// Shared CSV loader for the dev scripts (merchant-groups, recurring-diff).
//
// Paths are CSV files or directories of them. Accepted: Santander exports (the
// files you import; parsed and categorized exactly like ImportCSV) and Tatu's
// own CSV export from Transacciones ("Date,Description,…"), which covers your
// whole history. Renames are in neither CSV, so rows carry the raw description.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import type { Transaction } from '../src/models'
import { categorizeParsedData } from '../src/services/categorizer/import-categorization'
import { parseCSV } from '../src/services/parsers'

export function csvFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort()
    .map((name) => join(path, name))
}

function isTatuExport(content: string): boolean {
  // Skips a byte-order mark (U+FEFF) if a spreadsheet added one.
  const start = content.charCodeAt(0) === 0xfeff ? 1 : 0
  return /^"?Date"?,"?Description"?,/.test(content.slice(start))
}

function fromTatuExport(content: string, file: string): Transaction[] {
  const { data } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })
  // Rows the app leaves out of totals (transfers, ignored categories, split
  // parents) never reach "Mayores comercios" or Insights.
  const counted = data.filter((row) => row.cuenta_en_totales !== '0')
  return counted.map((row, i) => ({
    id: `${file}:${i}`,
    date: new Date(`${row.Date}T00:00:00.000Z`),
    description: row.Description ?? '',
    amount: Number(row.Amount),
    currency: row.Currency === 'USD' ? 'USD' : 'UYU',
    type: row.Type === 'credit' ? 'credit' : 'debit',
    source: 'bank_account',
    rawData: {},
  }))
}

function loadFile(file: string): Transaction[] {
  const content = readFileSync(file, 'utf-8')
  return isTatuExport(content)
    ? fromTatuExport(content, file)
    : categorizeParsedData(parseCSV(content, file)).transactions
}

/** Every row of every CSV under `paths` (default: samples/). */
export function loadTransactions(paths: string[]): {
  files: string[]
  rows: Transaction[]
} {
  const files = (paths.length ? paths : ['samples']).flatMap(csvFiles)
  return { files, rows: files.flatMap(loadFile) }
}
