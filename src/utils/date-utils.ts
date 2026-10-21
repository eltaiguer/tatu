// Date helpers. The convention (#58, docs/architecture.md "Dates"): a
// transaction's `date` is a calendar day, held as that day's UTC midnight, and
// is only ever read with UTC accessors or `timeZone: 'UTC'`. Rows stored
// before #58 sit at the importing browser's local midnight (03:00Z from
// Uruguay); they are snapped to UTC midnight when loaded (`toCalendarDay`),
// and read the same either way. "Today" is the user's local calendar day,
// expressed the same way (`todayAsUtcDate`).

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

/**
 * The newest `date` among `rows`, or null when there are none. Which rows
 * count is the caller's choice (every row, or only those that count toward
 * totals). A loop, not `Math.max(...dates)`: spreading a long history
 * overflows the call stack.
 */
export function newestDate(rows: ReadonlyArray<{ date: Date }>): Date | null {
  let newest: Date | null = null
  for (const { date } of rows) {
    if (newest === null || date.getTime() > newest.getTime()) newest = date
  }
  return newest
}

/**
 * The month of the newest row (`m` 0-based, read in UTC like every
 * transaction date, #58), or null when there are none: the month a view
 * opens on when it starts "on the newest month with data".
 */
export function newestDataMonth(
  rows: ReadonlyArray<{ date: Date }>
): { y: number; m: number } | null {
  const newest = newestDate(rows)
  if (!newest) return null
  return { y: newest.getUTCFullYear(), m: newest.getUTCMonth() }
}
