import type { Currency, Transaction } from '../../models'
import { isSplitParentTx } from '../../models'
import { isCategoryIgnored } from '../categories/category-registry'
import { normalizeCategoryId } from '../categories/category-aliases'
import { convert } from '../currency/convert'
import { toMonthKey } from '../../utils/date-utils'

export interface CategorySpendingDatum {
  category: string
  total: number
  // Number of expense rows summed into `total` (same filter).
  count: number
}

export interface MonthlyTrendDatum {
  month: string
  income: number
  expense: number
  net: number
}

// --- Multicurrency converting selectors ---
// All functions below accept (transactions, homeCurrency, fxRate) and
// convert every amount to homeCurrency before aggregating.

export interface MonthSummary {
  income: number
  expense: number
  net: number
  count: number
  split: { USD: number; UYU: number }
  monthLabel: string
  // True when the latest month with data is today's calendar month — only
  // then may the UI call it "este mes".
  isCurrentMonth: boolean
  // The month summarized (UTC calendar month of the dates; m is 0-based),
  // for linking to exactly its rows. Undefined when there is no data.
  y?: number
  m?: number
}

export interface CurrencySplitData {
  USD: number
  UYU: number
  total: number
  pctUSD: number
  pctUYU: number
}

// A transaction is excluded from every total when its category is ignored
// (transfers, the legacy 'ignored' id, or any category the user flagged) or
// when it is the inert parent row of a split.
export function isExcludedFromTotals(tx: Transaction): boolean {
  return isCategoryIgnored(tx.category) || isSplitParentTx(tx)
}

export function buildCategorySpendingConverted(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CategorySpendingDatum[] {
  const grouped = new Map<string, { total: number; count: number }>()

  transactions.forEach((tx) => {
    if (tx.type !== 'debit' || isExcludedFromTotals(tx)) return
    // Same id Categorías and the Transacciones filter use, so a category row
    // links to exactly the rows it sums.
    const category = normalizeCategoryId(tx.category)
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    const entry = grouped.get(category) ?? { total: 0, count: 0 }
    entry.total += converted
    entry.count += 1
    grouped.set(category, entry)
  })

  return Array.from(grouped.entries())
    .map(([category, { total, count }]) => ({ category, total, count }))
    .sort((a, b) => b.total - a.total)
}

export function buildMonthlyTrendsConverted(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MonthlyTrendDatum[] {
  const grouped = new Map<string, MonthlyTrendDatum>()

  transactions.forEach((tx) => {
    if (isExcludedFromTotals(tx)) return
    const month = toMonthKey(tx.date)
    if (!grouped.has(month)) {
      grouped.set(month, { month, income: 0, expense: 0, net: 0 })
    }
    const entry = grouped.get(month)!
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.type === 'credit') {
      entry.income += converted
      entry.net += converted
    } else if (tx.type === 'debit') {
      entry.expense += converted
      entry.net -= converted
    }
  })

  return Array.from(grouped.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  )
}

export function buildCurrentMonthSummary(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number,
  now: Date = new Date()
): MonthSummary {
  // Reference month comes from countable transactions only — a trailing
  // transfer or ignored row must not drag "este mes" onto an empty month.
  const counted = transactions.filter((tx) => !isExcludedFromTotals(tx))
  if (counted.length === 0) {
    return {
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
      split: { USD: 0, UYU: 0 },
      monthLabel: '',
      isCurrentMonth: false,
    }
  }

  const latest = counted.reduce(
    (max, tx) => (tx.date > max ? tx.date : max),
    counted[0].date
  )
  const m = latest.getUTCMonth()
  const y = latest.getUTCFullYear()

  const monthTxs = counted.filter(
    (tx) => tx.date.getUTCFullYear() === y && tx.date.getUTCMonth() === m
  )

  let income = 0
  let expense = 0
  const split: { USD: number; UYU: number } = { USD: 0, UYU: 0 }

  monthTxs.forEach((tx) => {
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.type === 'credit') {
      income += converted
    } else if (tx.type === 'debit') {
      expense += converted
      split[tx.currency] += tx.amount
    }
  })

  // Transaction dates are calendar days stored at UTC midnight; "now" is the
  // user's local calendar day.
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth()

  const monthLabel = latest.toLocaleDateString('es-UY', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return {
    income,
    expense,
    net: income - expense,
    count: monthTxs.length,
    split,
    monthLabel,
    isCurrentMonth,
    y,
    m,
  }
}

export function buildCurrencySplit(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CurrencySplitData {
  let usd = 0
  let uyu = 0

  transactions.forEach((tx) => {
    if (tx.type !== 'debit' || isExcludedFromTotals(tx)) return
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    if (tx.currency === 'USD') usd += converted
    else uyu += converted
  })

  const total = usd + uyu || 1
  return {
    USD: usd,
    UYU: uyu,
    total: usd + uyu,
    pctUSD: (usd / total) * 100,
    pctUYU: (uyu / total) * 100,
  }
}

export type AccountBucket = 'card' | 'usd' | 'uyu'

export interface AccountSpend {
  conv: number
  USD: number
  UYU: number
  count: number
  pct: number
  // Dates of the first and last expense summed, so a card can say which
  // period its own number covers (accounts are imported separately).
  first?: Date
  last?: Date
}

export type SpendByAccount = Record<AccountBucket, AccountSpend>

// Aggregates debit expenses (excl. transfers + ignored) by source account.
// card = credit_card (any currency), usd/uyu = bank_account by tx currency.
export function spendByAccount(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): SpendByAccount {
  const map: SpendByAccount = {
    card: { conv: 0, USD: 0, UYU: 0, count: 0, pct: 0 },
    usd: { conv: 0, USD: 0, UYU: 0, count: 0, pct: 0 },
    uyu: { conv: 0, USD: 0, UYU: 0, count: 0, pct: 0 },
  }

  transactions
    .filter((tx) => tx.type === 'debit' && !isExcludedFromTotals(tx))
    .forEach((tx) => {
      let bucket: AccountBucket
      if (tx.source === 'credit_card') {
        bucket = 'card'
      } else if (tx.currency === 'USD') {
        bucket = 'usd'
      } else {
        bucket = 'uyu'
      }
      const a = map[bucket]
      a.conv += convert(tx.amount, tx.currency, homeCurrency, fxRate)
      a[tx.currency] += tx.amount
      a.count++
      if (!a.first || tx.date < a.first) a.first = tx.date
      if (!a.last || tx.date > a.last) a.last = tx.date
    })

  const total = map.card.conv + map.usd.conv + map.uyu.conv || 1
  ;(Object.keys(map) as AccountBucket[]).forEach((b) => {
    map[b].pct = (map[b].conv / total) * 100
  })

  return map
}

export interface SavingsSummary {
  // Median monthly net — the "typical month", robust to one-off inflows.
  typicalNet: number
  meanNet: number
  positiveMonths: number
  totalMonths: number
  // Month whose net pulls the mean to the opposite sign of the median, so the
  // card can explain why the average looks different from the typical month.
  outlier: { month: string; net: number } | null
}

export function summarizeSavings(
  months: { month: string; net: number }[]
): SavingsSummary {
  const totalMonths = months.length
  if (totalMonths === 0) {
    return {
      typicalNet: 0,
      meanNet: 0,
      positiveMonths: 0,
      totalMonths: 0,
      outlier: null,
    }
  }

  const nets = months.map((m) => m.net).sort((a, b) => a - b)
  const mid = Math.floor(totalMonths / 2)
  const typicalNet =
    totalMonths % 2 === 0 ? (nets[mid - 1] + nets[mid]) / 2 : nets[mid]
  const meanNet = nets.reduce((s, n) => s + n, 0) / totalMonths
  const positiveMonths = months.filter((m) => m.net >= 0).length

  // The month that pulled the mean across zero must lie in the mean's
  // direction: the largest net when the mean is positive, the smallest when
  // negative.
  const outlier =
    meanNet >= 0 !== typicalNet >= 0
      ? months.reduce((pick, m) =>
          meanNet >= 0
            ? m.net > pick.net
              ? m
              : pick
            : m.net < pick.net
              ? m
              : pick
        )
      : null

  return {
    typicalNet,
    meanNet,
    positiveMonths,
    totalMonths,
    outlier: outlier ? { month: outlier.month, net: outlier.net } : null,
  }
}

// Round, evenly spaced axis ticks (steps of 1/2/2.5/5 × 10^n) that always
// include zero, so abbreviated labels like "US$ 10k" never look uneven.
export function niceTicks(min: number, max: number, count = 5): number[] {
  const lo = Math.min(min, 0)
  const hi = Math.max(max, 0)
  if (lo === hi) return [0]

  const rough = (hi - lo) / Math.max(count - 1, 1)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const residual = rough / magnitude
  const step =
    magnitude *
    (residual <= 1
      ? 1
      : residual <= 2
        ? 2
        : residual <= 2.5
          ? 2.5
          : residual <= 5
            ? 5
            : 10)

  const first = Math.floor(lo / step)
  const last = Math.ceil(hi / step)
  const ticks: number[] = []
  for (let i = first; i <= last; i++) ticks.push(i * step)
  return ticks
}
