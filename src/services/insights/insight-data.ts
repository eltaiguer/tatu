import type { Currency, Transaction } from '../../models'
import { isSplitParentTx } from '../../models'
import { isCategoryIgnored } from '../categories/category-registry'
import { convert } from '../currency/convert'
import {
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
} from '../charts/chart-data'
import { toDateKey, toMonthKey } from '../../utils/date-utils'

export interface CategoryInsightTotal {
  category: string
  amount: number
  pctOfTotal: number
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
  /** Month key ('YYYY-MM') of this merchant's most recent transaction. */
  lastSeenMonth: string
  /**
   * Whole months between lastSeenMonth and the month of historyEnd — lets
   * the model (and the prompt) distinguish an active subscription from one
   * that hasn't charged in a while, now that there's no lookback window to
   * age old charges out (see ADR-0002).
   */
  monthsSinceLastSeen: number
}

export interface MonthlyTrendPoint {
  month: string
  income: number
  expense: number
}

export interface InsightInput {
  /** Earliest/latest transaction date (toDateKey format), '' if none. */
  historyStart: string
  historyEnd: string
  homeCurrency: Currency
  categoryTotals: CategoryInsightTotal[]
  topMerchants: MerchantTotal[]
  recurringCharges: RecurringCharge[]
  monthlyTrend: MonthlyTrendPoint[]
}

const TOP_MERCHANTS_LIMIT = 8
const RECURRING_MIN_MONTHS_SEEN = 3
const RECURRING_AMOUNT_VARIANCE = 0.15

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

function monthKeyDiff(fromMonthKey: string, toMonthKeyStr: string): number {
  const [fromYear, fromMonth] = fromMonthKey.split('-').map(Number)
  const [toYear, toMonth] = toMonthKeyStr.split('-').map(Number)
  return (toYear * 12 + toMonth) - (fromYear * 12 + fromMonth)
}

function buildCategoryTotals(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): CategoryInsightTotal[] {
  const totals = buildCategorySpendingConverted(
    transactions,
    homeCurrency,
    fxRate
  )
  const grandTotal = totals.reduce((sum, d) => sum + d.total, 0) || 1

  return totals.map((d) => ({
    category: d.category,
    amount: d.total,
    pctOfTotal: (d.total / grandTotal) * 100,
  }))
}

function buildTopMerchants(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MerchantTotal[] {
  const byMerchant = new Map<string, MerchantTotal>()

  transactions.forEach((tx) => {
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
  historyEndMonthKey: string
): RecurringCharge[] {
  const relevant = allTransactions.filter(isEligibleDebit)

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

    const sortedDates = txs
      .map((tx) => tx.date)
      .sort((a, b) => a.getTime() - b.getTime())
    const lastSeenMonth = toMonthKey(sortedDates[sortedDates.length - 1])

    charges.push({
      merchant,
      approxAmount,
      cadence: cadenceFromGap(averageGapDays(sortedDates)),
      monthsSeen,
      lastSeenMonth,
      monthsSinceLastSeen: monthKeyDiff(lastSeenMonth, historyEndMonthKey),
    })
  })

  return charges.sort((a, b) => b.approxAmount - a.approxAmount)
}

/**
 * Builds the deterministic, pre-computed input handed to the AI insight
 * generator, over the user's *entire* transaction history — there is no
 * period/month scoping (see ADR-0002, which replaced the original
 * per-month design from ADR-0001). Every number here is derived from
 * existing aggregator/chart selectors — the model only ranks and narrates
 * these values, it never computes them.
 */
export function buildInsightInput(
  allTransactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): InsightInput {
  if (allTransactions.length === 0) {
    return {
      historyStart: '',
      historyEnd: '',
      homeCurrency,
      categoryTotals: [],
      topMerchants: [],
      recurringCharges: [],
      monthlyTrend: [],
    }
  }

  const dates = allTransactions.map((tx) => tx.date)
  const historyStartDate = new Date(
    Math.min(...dates.map((d) => d.getTime()))
  )
  const historyEndDate = new Date(Math.max(...dates.map((d) => d.getTime())))
  const historyEndMonthKey = toMonthKey(historyEndDate)

  return {
    historyStart: toDateKey(historyStartDate),
    historyEnd: toDateKey(historyEndDate),
    homeCurrency,
    categoryTotals: buildCategoryTotals(allTransactions, homeCurrency, fxRate),
    topMerchants: buildTopMerchants(allTransactions, homeCurrency, fxRate),
    recurringCharges: detectRecurringCharges(
      allTransactions,
      homeCurrency,
      fxRate,
      historyEndMonthKey
    ),
    monthlyTrend: buildMonthlyTrendsConverted(
      allTransactions,
      homeCurrency,
      fxRate
    ).map((d) => ({ month: d.month, income: d.income, expense: d.expense })),
  }
}
