// Prints which merchants Insights reports as recurring charges under the old
// rules and under the current one (#59), so false positives and lost
// detections are easy to judge on real data before trusting the new rule.
//
//   npx vite-node scripts/recurring-diff.ts [--home UYU|USD] [--fx 40.5] [paths...]
//
// Paths: Santander CSVs and/or Tatu's CSV export (see load-transactions.ts);
// default samples/. Three rule sets are compared:
//   main  — group by raw description, every charge within ±15% of the median
//   #120  — group by the merchant key, every charge within ±15% (PR #184)
//   #59   — the shipped rule: buildInsightInput().recurringCharges
// "main" and "#120" are re-implemented here only for the comparison. Rows are
// lined up by merchant key; cells read "approxAmount × in-band months".

import type { Currency, Transaction } from '../src/models'
import { convert } from '../src/services/currency/convert'
import {
  buildInsightInput,
  isInstallment,
} from '../src/services/insights/insight-data'
import {
  groupByMerchant,
  merchantKeyOf,
} from '../src/services/merchants/merchant-key'
import { isCountedExpense } from '../src/services/spending/spending-rules'
import { toMonthKey } from '../src/utils/date-utils'
import { loadTransactions } from './load-transactions'

interface Detected {
  key: string
  merchant: string
  approxAmount: number
  monthsSeen: number
}

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const homeCurrency: Currency = flag('--home', 'UYU') === 'USD' ? 'USD' : 'UYU'
const fxRate = Number(flag('--fx', '40.5'))
const paths = process.argv
  .slice(2)
  .filter(
    (a, i, all) =>
      !a.startsWith('--') && all[i - 1] !== '--home' && all[i - 1] !== '--fx'
  )

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const round2 = (n: number) => Math.round(n * 100) / 100

// The pre-#59 rule: ≥ 3 months seen and EVERY charge within ±15%.
function everyWithinRule(
  groups: { label: string; transactions: Transaction[] }[]
): Detected[] {
  const out: Detected[] = []
  for (const { label, transactions: txs } of groups) {
    const monthsSeen = new Set(txs.map((tx) => toMonthKey(tx.date))).size
    if (monthsSeen < 3) continue
    const amounts = txs.map((tx) =>
      convert(tx.amount, tx.currency, homeCurrency, fxRate)
    )
    const m = median(amounts)
    const ok = amounts.every((a) =>
      m === 0 ? a === 0 : Math.abs(a - m) / m <= 0.15
    )
    if (ok) {
      out.push({
        key: merchantKeyOf(txs[0]),
        merchant: label,
        approxAmount: round2(m),
        monthsSeen,
      })
    }
  }
  return out
}

function byRawDescription(rows: Transaction[]) {
  const map = new Map<string, Transaction[]>()
  for (const tx of rows) {
    const key = (tx.displayDescription ?? tx.description).trim()
    map.set(key, [...(map.get(key) ?? []), tx])
  }
  return [...map].map(([label, transactions]) => ({ label, transactions }))
}

const { files, rows } = loadTransactions(paths)
const expenses = rows.filter(isCountedExpense)

// buildInsightInput reports labels; map them back to keys so the three
// columns line up per merchant (#59 drops installment rows, which can change
// a group's label, hence the second map).
const keyByLabel = new Map<string, string>()
for (const g of groupByMerchant(expenses)) keyByLabel.set(g.label, g.key)
for (const g of groupByMerchant(expenses.filter((tx) => !isInstallment(tx)))) {
  keyByLabel.set(g.label, g.key)
}

const rules: Record<'main' | '#120' | '#59', Detected[]> = {
  main: everyWithinRule(byRawDescription(expenses)),
  '#120': everyWithinRule(groupByMerchant(expenses)),
  '#59': buildInsightInput(rows, homeCurrency, fxRate).recurringCharges.map(
    (c) => ({ ...c, key: keyByLabel.get(c.merchant) ?? c.merchant })
  ),
}

const keys = [
  ...new Set(Object.values(rules).flatMap((list) => list.map((d) => d.key))),
].sort((a, b) => a.localeCompare(b))

// "main" can detect several raw-description groups under one key.
function cell(list: Detected[], key: string): string {
  const found = list.filter((x) => x.key === key)
  if (found.length === 0) return '—'
  const [d] = found
  const more = found.length > 1 ? ` (+${found.length - 1})` : ''
  return `${d.approxAmount} × ${d.monthsSeen}mo${more}`
}

console.log(
  `${rows.length} rows from ${files.length} file(s), ${expenses.length} counted ` +
    `expenses; amounts in ${homeCurrency} (fx ${fxRate})`
)
console.log(
  `recurring: main ${rules.main.length}, #120 ${rules['#120'].length}, ` +
    `#59 ${rules['#59'].length}\n`
)
const width = Math.max(12, ...keys.map((k) => k.length))
console.log(
  `${'merchant key'.padEnd(width)}  ${'main'.padEnd(18)}${'#120'.padEnd(18)}#59`
)
for (const key of keys) {
  const cols = (['main', '#120', '#59'] as const).map((r) =>
    cell(rules[r], key)
  )
  const [inMain, inBase, inNew] = cols.map((c) => c !== '—')
  // Relative to main (what production shows today); "#120 only" is a
  // detection #184 alone would add and #59 removes again (installments).
  const change =
    !inMain && inNew ? '  + new' : inMain && !inNew ? '  - lost' : ''
  const only120 = inBase && !inMain && !inNew ? '  (#120 only)' : ''
  console.log(
    `${key.padEnd(width)}  ${cols[0].padEnd(18)}${cols[1].padEnd(18)}${cols[2]}${change}${only120}`
  )
}
