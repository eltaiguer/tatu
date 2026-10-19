// Prints how the canonical merchant key (#120) groups real descriptions:
// every key that merges two or more raw variants, so wrong merges are easy to
// spot before trusting "Mayores comercios" / Insights on your own data.
//
//   npx vite-node scripts/merchant-groups.ts [--all] [--credits] [paths...]
//
// Paths are CSV files or directories of them (default: samples/). Accepted:
// Santander exports (the files you import) and Tatu's own CSV export from
// Transacciones ("Date,Description,…"), which covers your whole history.
// --all also lists keys with a single variant; --credits includes income rows
// (merchant lists only ever group expenses).
//
// Renames are not in either CSV, so this shows the raw-description path of the
// key — the one that strips noise and can over-merge.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import type { Transaction } from '../src/models'
import { parseCSV } from '../src/services/parsers'
import { groupByMerchant } from '../src/services/merchants/merchant-key'

const args = process.argv.slice(2)
const showAll = args.includes('--all')
const includeCredits = args.includes('--credits')
const paths = args.filter((a) => !a.startsWith('--'))

function csvFiles(path: string): string[] {
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
  // parents) never reach "Mayores comercios".
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

function load(file: string): Transaction[] {
  const content = readFileSync(file, 'utf-8')
  return isTatuExport(content)
    ? fromTatuExport(content, file)
    : parseCSV(content, file).transactions
}

const files = (paths.length ? paths : ['samples']).flatMap(csvFiles)
const rows = files
  .flatMap(load)
  .filter((tx) => includeCredits || tx.type === 'debit')

const groups = groupByMerchant(rows)
  .map((group) => {
    const variants = new Map<string, number>()
    for (const tx of group.transactions) {
      const name = tx.description.trim()
      variants.set(name, (variants.get(name) ?? 0) + 1)
    }
    return { ...group, variants }
  })
  .filter((group) => showAll || group.variants.size > 1)
  .sort(
    (a, b) =>
      b.variants.size - a.variants.size ||
      b.transactions.length - a.transactions.length ||
      a.key.localeCompare(b.key)
  )

console.log(
  `${rows.length} rows from ${files.length} file(s); ` +
    `${groups.length} ${showAll ? '' : 'merged '}merchant group(s)\n`
)
for (const group of groups) {
  console.log(
    `${group.key}  (${group.transactions.length} rows, label: ${group.label})`
  )
  for (const [variant, count] of [...group.variants].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )) {
    console.log(`    ${String(count).padStart(4)} × ${variant}`)
  }
}
