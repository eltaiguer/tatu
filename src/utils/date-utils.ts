// Date helpers. The convention (#58, docs/architecture.md "Dates"): a
// transaction's `date` is a calendar day, held as that day's UTC midnight, and
// is only ever read with UTC accessors or `timeZone: 'UTC'`. Rows stored
// before #58 sit at the importing browser's local midnight (03:00Z from
// Uruguay); they are snapped to UTC midnight when loaded (`toCalendarDay`),
// and read the same either way. "Today" is the user's local calendar day,
// expressed the same way (`todayAsUtcDate`).

export type Period = 'week' | 'month' | 'quarter' | 'year' | 'all'

export interface PeriodOption {
  id: string
  label: string
  period: Period
  referenceDate?: Date
}

export interface DateRange {
  start: Date
  end: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The local calendar day of `now`, as a UTC-midnight calendar date. */
export function todayAsUtcDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/**
 * The calendar day a stored date stands for, at UTC midnight. A row written
 * at local midnight by a browser anywhere from UTC-11 to UTC+12 rounds to its
 * own day.
 */
export function toCalendarDay(date: Date): Date {
  return new Date(Math.round(date.getTime() / DAY_MS) * DAY_MS)
}

/** Days since the epoch of a transaction date's UTC calendar day. */
export function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS)
}

/** Whole calendar days between two transaction dates (read in UTC). */
export function calendarDaysBetween(a: Date, b: Date): number {
  return Math.abs(utcDayNumber(a) - utcDayNumber(b))
}

const MONTHS_ES_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

function utcDate(y: number, m: number, d = 1): Date {
  return new Date(Date.UTC(y, m, d))
}

function monthLabel(date: Date): string {
  return `${MONTHS_ES_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * The UTC calendar range of a period around a reference calendar date.
 * @param period - The period type (week, month, quarter, year)
 * @param referenceDate - A UTC calendar date (defaults to today)
 * @returns Start (UTC midnight) and end (last millisecond of the last day)
 */
export function getDateRangeForPeriod(
  period: Period,
  referenceDate: Date = todayAsUtcDate()
): DateRange {
  const y = referenceDate.getUTCFullYear()
  const m = referenceDate.getUTCMonth()
  const d = referenceDate.getUTCDate()
  const until = (next: Date) => new Date(next.getTime() - 1)
  switch (period) {
    case 'week': {
      // Weeks start on Monday
      const sinceMonday = (referenceDate.getUTCDay() + 6) % 7
      return {
        start: utcDate(y, m, d - sinceMonday),
        end: until(utcDate(y, m, d - sinceMonday + 7)),
      }
    }
    case 'month':
      return { start: utcDate(y, m), end: until(utcDate(y, m + 1)) }
    case 'quarter': {
      const first = m - (m % 3)
      return { start: utcDate(y, first), end: until(utcDate(y, first + 3)) }
    }
    case 'year':
      return { start: utcDate(y, 0), end: until(utcDate(y + 1, 0)) }
    case 'all':
      return {
        start: new Date(0),
        end: new Date(8640000000000000), // Max date
      }
    default:
      throw new Error(`Invalid period: ${period}`)
  }
}

function isWithin(date: Date, range: DateRange): boolean {
  return date >= range.start && date <= range.end
}

/**
 * Check if a date is within a given period
 * @param date - The date to check
 * @param period - The period type
 * @param referenceDate - A UTC calendar date (defaults to today)
 * @returns True if the date is within the period
 */
export function isDateInPeriod(
  date: Date,
  period: Period,
  referenceDate: Date = todayAsUtcDate()
): boolean {
  return isWithin(date, getDateRangeForPeriod(period, referenceDate))
}

/**
 * Filter an array of items by date property within a period
 * @param items - Array of items to filter
 * @param dateKey - The key of the date property
 * @param period - The period type
 * @param referenceDate - A UTC calendar date (defaults to today)
 * @returns Filtered array of items
 */
export function filterByPeriod<T>(
  items: T[],
  dateKey: keyof T,
  period: Period,
  referenceDate: Date = todayAsUtcDate()
): T[] {
  if (period === 'all') {
    return items
  }

  const range = getDateRangeForPeriod(period, referenceDate)

  return items.filter((item) => {
    const itemDate = item[dateKey]
    if (!(itemDate instanceof Date)) {
      return false
    }
    return isWithin(itemDate, range)
  })
}

/**
 * Generate dynamic period options based on transaction dates
 * @param transactionDates - Transaction dates (UTC calendar dates)
 * @param now - The current instant; its local calendar day is "today"
 * @returns Period options whose referenceDate is a UTC calendar date
 */
export function generatePeriodOptions(
  transactionDates: Date[],
  now: Date = new Date()
): PeriodOption[] {
  const today = todayAsUtcDate(now)
  const currentYear = today.getUTCFullYear()
  const currentMonth = today.getUTCMonth()
  const quarterOf = (date: Date) => Math.floor(date.getUTCMonth() / 3) + 1
  const options: PeriodOption[] = []

  // Always show "All" option
  options.push({
    id: 'all',
    label: 'Todo',
    period: 'all',
  })

  // Current week
  options.push({
    id: 'this-week',
    label: 'Esta semana',
    period: 'week',
    referenceDate: today,
  })

  // Current month
  options.push({
    id: 'this-month',
    label: `Este mes (${monthLabel(today)})`,
    period: 'month',
    referenceDate: today,
  })

  // Previous month
  const prevMonth = utcDate(currentYear, currentMonth - 1)
  options.push({
    id: 'prev-month',
    label: `Mes anterior (${monthLabel(prevMonth)})`,
    period: 'month',
    referenceDate: prevMonth,
  })

  // Current quarter
  const currentQuarter = quarterOf(today)
  options.push({
    id: `q${currentQuarter}-${currentYear}`,
    label: `Q${currentQuarter} ${currentYear}`,
    period: 'quarter',
    referenceDate: today,
  })

  // Previous quarter (if different from current)
  const prevQuarterDate = utcDate(currentYear, currentMonth - 3)
  const prevQuarter = quarterOf(prevQuarterDate)
  const prevQuarterYear = prevQuarterDate.getUTCFullYear()
  if (prevQuarter !== currentQuarter || prevQuarterYear !== currentYear) {
    options.push({
      id: `q${prevQuarter}-${prevQuarterYear}`,
      label: `Q${prevQuarter} ${prevQuarterYear}`,
      period: 'quarter',
      referenceDate: prevQuarterDate,
    })
  }

  // Current year
  options.push({
    id: `year-${currentYear}`,
    label: `${currentYear}`,
    period: 'year',
    referenceDate: today,
  })

  // Previous year (if transactions exist from that year)
  const prevYear = currentYear - 1
  const hasTransactionsFromPrevYear = transactionDates.some(
    (d) => d.getUTCFullYear() === prevYear
  )
  if (hasTransactionsFromPrevYear) {
    options.push({
      id: `year-${prevYear}`,
      label: `${prevYear}`,
      period: 'year',
      referenceDate: utcDate(prevYear, 6), // Mid-year as reference
    })
  }

  return options
}

export function toDateKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}
