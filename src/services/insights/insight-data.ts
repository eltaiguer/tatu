import type { Currency, Transaction } from '../../models'
import { isCountedExpense } from '../spending/spending-rules'
import { convert } from '../currency/convert'
import {
  buildCategorySpendingConverted,
  buildMerchantSpendingConverted,
  buildMonthlyTrendsConverted,
} from '../charts/chart-data'
import { groupByMerchant } from '../merchants/merchant-key'
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
  /**
   * Month key ('YYYY-MM') of this merchant's most recent charge, in band or
   * not, so a price rise doesn't read as a lapse.
   */
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
const RECURRING_MIN_IN_BAND_SHARE = 0.75
// Santander's installment counter, "Cuota 09 10" (instalment 9 of 10).
const INSTALLMENT_PATTERN = /\bcuota\s+\d{1,2}\s*[/ ]\s*\d{1,2}\b/i

/**
 * Rounds to cents. Every number handed to the model goes through this: the
 * prompt asks it to echo amounts back exactly and insight-generator validates
 * them with ===, so unrounded FX residue (50000 / 40.5 = 1234.5679012345679)
 * would make a legitimate echo of 1234.57 fail validation and get dropped —
 * the card then renders with no number on it, silently.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function monthKeyDiff(fromMonthKey: string, toMonthKeyStr: string): number {
  const [fromYear, fromMonth] = fromMonthKey.split('-').map(Number)
  const [toYear, toMonth] = toMonthKeyStr.split('-').map(Number)
  return toYear * 12 + toMonth - (fromYear * 12 + fromMonth)
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
    amount: round2(d.total),
    pctOfTotal: round2((d.total / grandTotal) * 100),
  }))
}

// Same aggregation and merchant key as Resumen's "Mayores comercios"; the
// label is what the model may echo back as `merchant`.
function buildTopMerchants(
  transactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number
): MerchantTotal[] {
  return buildMerchantSpendingConverted(transactions, homeCurrency, fxRate)
    .slice(0, TOP_MERCHANTS_LIMIT)
    .map((m) => ({
      merchant: m.label,
      amount: round2(m.total),
      count: m.count,
    }))
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

function isWithinBand(amount: number, reference: number): boolean {
  return reference === 0
    ? amount === 0
    : Math.abs(amount - reference) / reference <= RECURRING_AMOUNT_VARIANCE
}

/**
 * Recurring-charge rule (#59). Per merchant key, over all counted expenses
 * except installment purchases:
 * - a charge is "in band" when it is within ±15% of the median of all the
 *   merchant's charges;
 * - the merchant is recurring when ≥ 75% of its charges are in band AND the
 *   in-band charges fall in ≥ 3 distinct months (several charges in one month
 *   count once).
 * approxAmount (median of the in-band charges), monthsSeen and cadence
 * describe the in-band charges only, so a one-off annual fee or a price spike
 * neither blocks detection nor skews the amount. lastSeenMonth is the latest
 * charge of any amount: the merchant is still charging after a price rise.
 *
 * Installments ("Cuota N M") are excluded: a fixed monthly payment of a
 * purchase already made is not a subscription the user can cancel.
 */
function detectRecurringCharges(
  allTransactions: Transaction[],
  homeCurrency: Currency,
  fxRate: number,
  historyEndMonthKey: string
): RecurringCharge[] {
  const relevant = allTransactions.filter(
    (tx) => isCountedExpense(tx) && !INSTALLMENT_PATTERN.test(tx.description)
  )

  const charges: RecurringCharge[] = []

  // Grouped by the merchant key, reported by its label (#120).
  groupByMerchant(relevant).forEach(
    ({ label: merchant, transactions: txs }) => {
      const converted = txs.map((tx) => ({
        date: tx.date,
        amount: convert(tx.amount, tx.currency, homeCurrency, fxRate),
      }))
      const groupMedian = median(converted.map((c) => c.amount))
      const inBand = converted.filter((c) =>
        isWithinBand(c.amount, groupMedian)
      )
      if (inBand.length / converted.length < RECURRING_MIN_IN_BAND_SHARE) {
        return
      }

      const monthsSeen = new Set(inBand.map((c) => toMonthKey(c.date))).size
      if (monthsSeen < RECURRING_MIN_MONTHS_SEEN) return

      const sortedDates = inBand
        .map((c) => c.date)
        .sort((a, b) => a.getTime() - b.getTime())
      let lastSeenMs = -Infinity
      for (const c of converted) {
        lastSeenMs = Math.max(lastSeenMs, c.date.getTime())
      }
      const lastSeenMonth = toMonthKey(new Date(lastSeenMs))

      charges.push({
        merchant,
        approxAmount: round2(median(inBand.map((c) => c.amount))),
        cadence: cadenceFromGap(averageGapDays(sortedDates)),
        monthsSeen,
        lastSeenMonth,
        monthsSinceLastSeen: monthKeyDiff(lastSeenMonth, historyEndMonthKey),
      })
    }
  )

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

  // Plain loop instead of Math.min/max(...spread) — spreading a getTime()
  // per transaction into a function call has no upper bound on argument
  // count and risks a call-stack error on a very large import history.
  let historyStartMs = Infinity
  let historyEndMs = -Infinity
  for (const tx of allTransactions) {
    const t = tx.date.getTime()
    if (t < historyStartMs) historyStartMs = t
    if (t > historyEndMs) historyEndMs = t
  }
  const historyStartDate = new Date(historyStartMs)
  const historyEndDate = new Date(historyEndMs)
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
    ).map((d) => ({
      month: d.month,
      income: round2(d.income),
      expense: round2(d.expense),
    })),
  }
}
