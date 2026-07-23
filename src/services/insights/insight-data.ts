import type { Currency, Transaction } from '../../models'
import { isSplitParentTx } from '../../models'
import { isCategoryIgnored } from '../categories/category-registry'
import { convert } from '../currency/convert'
import {
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
} from '../charts/chart-data'
import { toDateKey, toMonthKey } from '../../utils/date-utils'

export interface InsightPeriod {
  start: Date
  end: Date
}

/**
 * UTC-safe equivalent of date-fns subMonths — used for lookback windows
 * (recurring-charge detection, trend range) so they stay consistent with
 * getUtcMonthPeriod's UTC anchoring instead of drifting by the browser's
 * local UTC offset.
 */
function subUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() - months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  )
}

/**
 * Builds a calendar-month InsightPeriod anchored in UTC. Transaction dates
 * and toDateKey/toMonthKey are UTC-normalized throughout this codebase, but
 * date-fns helpers like date-utils.ts's getDateRangeForPeriod operate on the
 * browser's local timezone — reusing that here would shift period
 * boundaries by the local UTC offset and silently misattribute transactions
 * dated on the 1st/last day of the month to the wrong period. monthOffset
 * shifts by whole months (e.g. -1 for the previous month).
 */
export function getUtcMonthPeriod(
  referenceDate: Date,
  monthOffset = 0
): InsightPeriod {
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth() + monthOffset
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
  }
}

export interface CategoryInsightTotal {
  category: string
  amount: number
  pctOfTotal: number
  deltaVsPriorPeriod: number
}

export interface MerchantTotal {
  merchant: string
  amount: number
  count: number
}

export type RecurringCadence = 'weekly' | 'monthly' | 'irregular'

export interface RecurringCharge {
  merchant: string
  approxAmount: number
  cadence: RecurringCadence
  monthsSeen: number
}

export interface MonthlyTrendPoint {
  month: string
  income: number
  expense: number
}

export interface InsightInput {
  periodStart: string
  periodEnd: string
  homeCurrency: Currency
  categoryTotals: CategoryInsightTotal[]
  topMerchants: MerchantTotal[]
  recurringCharges: RecurringCharge[]
  monthlyTrend: MonthlyTrendPoint[]
}

const TOP_MERCHANTS_LIMIT = 8
const RECURRING_LOOKBACK_MONTHS = 6
const RECURRING_MIN_MONTHS_SEEN = 3
const RECURRING_AMOUNT_VARIANCE = 0.15
const TREND_MONTHS = 6

function isEligibleDebit(tx: Transaction): boolean {
  return (
    tx.type === 'debit' &&
    !isCategoryIgnored(tx.category) &&
    !isSplitParentTx(tx)
  )
}

function merchantOf(tx: Transaction): string {
  return (tx.displayDescription ?? tx.description).trim()
}

function filterInRange(
  transactions: Transaction[],
  start: Date,
  end: Date
): Transaction[] {
  return transactions.filter((tx) => tx.date >= start && tx.date <= end)
}

function priorPeriodOf(period: InsightPeriod): InsightPeriod {
  const spanMs = period.end.getTime() - period.start.getTime()
  const priorEnd = new Date(period.start.getTime() - 1)
  const priorStart = new Date(priorEnd.getTime() - spanMs)
  return { start: priorStart, end: priorEnd }
}

function buildCategoryTotals(
  periodTransactions: Transaction[],
  priorTransactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CategoryInsightTotal[] {
  const current = buildCategorySpendingConverted(
    periodTransactions,
    homeCurrency,
    fxRate
  )
  const priorByCategory = new Map(
    buildCategorySpendingConverted(priorTransactions, homeCurrency, fxRate).map(
      (d) => [d.category, d.total]
    )
  )
  const grandTotal = current.reduce((sum, d) => sum + d.total, 0) || 1

  return current.map((d) => ({
    category: d.category,
    amount: d.total,
    pctOfTotal: (d.total / grandTotal) * 100,
    deltaVsPriorPeriod: d.total - (priorByCategory.get(d.category) ?? 0),
  }))
}

function buildTopMerchants(
  periodTransactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MerchantTotal[] {
  const byMerchant = new Map<string, MerchantTotal>()

  periodTransactions.forEach((tx) => {
    if (!isEligibleDebit(tx)) return
    const merchant = merchantOf(tx)
    const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
    const entry = byMerchant.get(merchant) ?? { merchant, amount: 0, count: 0 }
    entry.amount += converted
    entry.count += 1
    byMerchant.set(merchant, entry)
  })

  return Array.from(byMerchant.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_MERCHANTS_LIMIT)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function averageGapDays(sortedDates: Date[]): number {
  if (sortedDates.length < 2) return Infinity
  const gaps: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    const days =
      (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) /
      (1000 * 60 * 60 * 24)
    gaps.push(days)
  }
  return gaps.reduce((sum, g) => sum + g, 0) / gaps.length
}

function cadenceFromGap(avgGapDays: number): RecurringCadence {
  if (avgGapDays <= 10) return 'weekly'
  if (avgGapDays <= 40) return 'monthly'
  return 'irregular'
}

function detectRecurringCharges(
  allTransactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number,
  asOf: Date
): RecurringCharge[] {
  const windowStart = subUtcMonths(asOf, RECURRING_LOOKBACK_MONTHS)
  const relevant = allTransactions.filter(
    (tx) => isEligibleDebit(tx) && tx.date >= windowStart && tx.date <= asOf
  )

  const byMerchant = new Map<string, Transaction[]>()
  relevant.forEach((tx) => {
    const merchant = merchantOf(tx)
    const list = byMerchant.get(merchant) ?? []
    list.push(tx)
    byMerchant.set(merchant, list)
  })

  const charges: RecurringCharge[] = []

  byMerchant.forEach((txs, merchant) => {
    const monthsSeen = new Set(txs.map((tx) => toMonthKey(tx.date))).size
    if (monthsSeen < RECURRING_MIN_MONTHS_SEEN) return

    const amounts = txs.map((tx) =>
      convert(tx.amount, tx.currency, homeCurrency, fxRate)
    )
    const approxAmount = median(amounts)
    const withinVariance = amounts.every((a) =>
      approxAmount === 0
        ? a === 0
        : Math.abs(a - approxAmount) / approxAmount <= RECURRING_AMOUNT_VARIANCE
    )
    if (!withinVariance) return

    const sortedDates = txs.map((tx) => tx.date).sort((a, b) => a.getTime() - b.getTime())

    charges.push({
      merchant,
      approxAmount,
      cadence: cadenceFromGap(averageGapDays(sortedDates)),
      monthsSeen,
    })
  })

  return charges.sort((a, b) => b.approxAmount - a.approxAmount)
}

function buildMonthlyTrend(
  allTransactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number,
  asOf: Date
): MonthlyTrendPoint[] {
  const windowStart = subUtcMonths(asOf, TREND_MONTHS - 1)
  const relevant = allTransactions.filter(
    (tx) => tx.date >= windowStart && tx.date <= asOf
  )
  return buildMonthlyTrendsConverted(relevant, homeCurrency, fxRate).map(
    (d) => ({ month: d.month, income: d.income, expense: d.expense })
  )
}

/**
 * Builds the deterministic, pre-computed input handed to the AI insight
 * generator. Every number here is derived from existing aggregator/chart
 * selectors — the model only ranks and narrates these values, it never
 * computes them (see ADR-0001).
 */
export function buildInsightInput(
  allTransactions: Transaction[],
  period: InsightPeriod,
  homeCurrency: Currency,
  fxRate: number
): InsightInput {
  const priorPeriod = priorPeriodOf(period)
  const periodTransactions = filterInRange(
    allTransactions,
    period.start,
    period.end
  )
  const priorTransactions = filterInRange(
    allTransactions,
    priorPeriod.start,
    priorPeriod.end
  )

  return {
    periodStart: toDateKey(period.start),
    periodEnd: toDateKey(period.end),
    homeCurrency,
    categoryTotals: buildCategoryTotals(
      periodTransactions,
      priorTransactions,
      homeCurrency,
      fxRate
    ),
    topMerchants: buildTopMerchants(periodTransactions, homeCurrency, fxRate),
    recurringCharges: detectRecurringCharges(
      allTransactions,
      homeCurrency,
      fxRate,
      period.end
    ),
    monthlyTrend: buildMonthlyTrend(
      allTransactions,
      homeCurrency,
      fxRate,
      period.end
    ),
  }
}
