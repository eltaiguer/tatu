// Tests for date utility functions

import { describe, it, expect } from 'vitest'
import {
  getDateRangeForPeriod,
  isDateInPeriod,
  filterByPeriod,
  generatePeriodOptions,
  todayAsUtcDate,
  toCalendarDay,
  calendarDaysBetween,
  toMonthKey,
} from './date-utils'

describe('date-utils', () => {
  describe('getDateRangeForPeriod', () => {
    it('should return correct range for week period', () => {
      // Wednesday, Jan 15, 2025
      const referenceDate = new Date('2025-01-15T12:00:00')
      const range = getDateRangeForPeriod('week', referenceDate)

      // Week starts on Monday
      expect(range.start.getUTCDay()).toBe(1) // Monday
      expect(range.end.getUTCDay()).toBe(0) // Sunday
    })

    it('should return correct range for month period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00')
      const range = getDateRangeForPeriod('month', referenceDate)

      expect(range.start.getUTCDate()).toBe(1) // First day of month
      expect(range.end.getUTCDate()).toBe(31) // Last day of January
      expect(range.start.getUTCMonth()).toBe(0) // January
      expect(range.end.getUTCMonth()).toBe(0) // January
    })

    it('should return correct range for quarter period', () => {
      const referenceDate = new Date('2025-02-15T12:00:00')
      const range = getDateRangeForPeriod('quarter', referenceDate)

      // Q1 is Jan-Mar
      expect(range.start.getUTCMonth()).toBe(0) // January
      expect(range.end.getUTCMonth()).toBe(2) // March
      expect(range.start.getUTCDate()).toBe(1)
      expect(range.end.getUTCDate()).toBe(31) // March 31
    })

    it('should return correct range for year period', () => {
      const referenceDate = new Date('2025-06-15T12:00:00')
      const range = getDateRangeForPeriod('year', referenceDate)

      expect(range.start.getUTCMonth()).toBe(0) // January
      expect(range.start.getUTCDate()).toBe(1)
      expect(range.end.getUTCMonth()).toBe(11) // December
      expect(range.end.getUTCDate()).toBe(31)
      expect(range.start.getUTCFullYear()).toBe(2025)
      expect(range.end.getUTCFullYear()).toBe(2025)
    })

    it('should use current date as default reference', () => {
      const range = getDateRangeForPeriod('month')
      const now = new Date()

      expect(range.start.getUTCMonth()).toBe(now.getMonth())
      expect(range.end.getUTCMonth()).toBe(now.getMonth())
    })
  })

  describe('isDateInPeriod', () => {
    it('should return true for date within week period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00') // Wednesday
      const testDate = new Date('2025-01-14T12:00:00') // Tuesday (same week)

      expect(isDateInPeriod(testDate, 'week', referenceDate)).toBe(true)
    })

    it('should return false for date outside week period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00') // Wednesday
      const testDate = new Date('2025-01-20T12:00:00') // Next week

      expect(isDateInPeriod(testDate, 'week', referenceDate)).toBe(false)
    })

    it('should return true for date within month period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00')
      const testDate = new Date('2025-01-25T12:00:00')

      expect(isDateInPeriod(testDate, 'month', referenceDate)).toBe(true)
    })

    it('should return false for date outside month period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00')
      const testDate = new Date('2025-02-15T12:00:00')

      expect(isDateInPeriod(testDate, 'month', referenceDate)).toBe(false)
    })
  })

  describe('filterByPeriod', () => {
    interface TestItem {
      id: number
      date: Date
      value: string
    }

    const testItems: TestItem[] = [
      { id: 1, date: new Date('2025-01-05'), value: 'item1' },
      { id: 2, date: new Date('2025-01-15'), value: 'item2' },
      { id: 3, date: new Date('2025-01-25'), value: 'item3' },
      { id: 4, date: new Date('2025-02-05'), value: 'item4' },
      { id: 5, date: new Date('2025-03-15'), value: 'item5' },
    ]

    it('should filter items by month period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00')
      const filtered = filterByPeriod(testItems, 'date', 'month', referenceDate)

      expect(filtered).toHaveLength(3)
      expect(filtered.map((i) => i.id)).toEqual([1, 2, 3])
    })

    it('should filter items by quarter period', () => {
      const referenceDate = new Date('2025-01-15T12:00:00')
      const filtered = filterByPeriod(
        testItems,
        'date',
        'quarter',
        referenceDate
      )

      // Q1 includes Jan, Feb, Mar
      expect(filtered).toHaveLength(5)
      expect(filtered.map((i) => i.id)).toEqual([1, 2, 3, 4, 5])
    })

    it('should return empty array when no items match period', () => {
      const referenceDate = new Date('2024-12-15T12:00:00')
      const filtered = filterByPeriod(testItems, 'date', 'month', referenceDate)

      expect(filtered).toHaveLength(0)
    })

    it('should handle items with non-date values', () => {
      const invalidItems = [
        { id: 1, date: new Date('2025-01-15'), value: 'valid' },
        { id: 2, date: 'not-a-date' as unknown as Date, value: 'invalid' },
      ]

      const referenceDate = new Date('2025-01-15T12:00:00')
      const filtered = filterByPeriod(
        invalidItems,
        'date',
        'month',
        referenceDate
      )

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(1)
    })
  })
})

describe('generatePeriodOptions', () => {
  // Fixed reference: Sunday 15 June 2025 (Q2)
  const TODAY = new Date('2025-06-15T12:00:00')

  it('always returns "all" as the first option with label "Todo"', () => {
    const options = generatePeriodOptions([], TODAY)
    expect(options[0].id).toBe('all')
    expect(options[0].label).toBe('Todo')
    expect(options[0].period).toBe('all')
  })

  it('always includes week, current month, previous month, current quarter, and current year', () => {
    const options = generatePeriodOptions([], TODAY)
    const ids = options.map((o) => o.id)
    expect(ids).toContain('this-week')
    expect(ids).toContain('this-month')
    expect(ids).toContain('prev-month')
    expect(ids).toContain('q2-2025')
    expect(ids).toContain('year-2025')
  })

  it('includes the previous quarter when it differs from the current quarter', () => {
    // June is Q2; previous quarter is Q1 2025
    const options = generatePeriodOptions([], TODAY)
    const ids = options.map((o) => o.id)
    expect(ids).toContain('q1-2025')
  })

  it('labels current and previous month in Spanish', () => {
    const options = generatePeriodOptions([], TODAY)
    const thisMonth = options.find((o) => o.id === 'this-month')
    const prevMonth = options.find((o) => o.id === 'prev-month')
    expect(thisMonth?.label).toMatch(/Este mes \(jun/i)
    expect(prevMonth?.label).toMatch(/Mes anterior \(may/i)
  })

  it('includes previous year when transactionDates has a date from that year', () => {
    const dates = [
      new Date('2024-11-01T12:00:00'),
      new Date('2025-03-15T12:00:00'),
    ]
    const options = generatePeriodOptions(dates, TODAY)
    const ids = options.map((o) => o.id)
    expect(ids).toContain('year-2024')
  })

  it('does not include previous year when no transaction dates from that year', () => {
    // Use noon to avoid UTC-offset dates crossing the year boundary
    const dates = [
      new Date('2025-03-15T12:00:00'),
      new Date('2025-05-15T12:00:00'),
    ]
    const options = generatePeriodOptions(dates, TODAY)
    const ids = options.map((o) => o.id)
    expect(ids).not.toContain('year-2024')
  })

  it('does not include previous year for an empty transactionDates array', () => {
    const options = generatePeriodOptions([], TODAY)
    const ids = options.map((o) => o.id)
    expect(ids).not.toContain('year-2024')
  })

  it('respects the referenceDate parameter — January reference uses Jan/Dec labels', () => {
    const january = new Date('2025-01-15T12:00:00')
    const options = generatePeriodOptions([], january)
    const thisMonth = options.find((o) => o.id === 'this-month')
    const prevMonth = options.find((o) => o.id === 'prev-month')
    expect(thisMonth?.label).toMatch(/ene/i)
    expect(prevMonth?.label).toMatch(/dic/i)
  })
})

// #58: a transaction date is a calendar day stored at UTC midnight (rows
// written before #58 by a UTC-3 browser sit at 03:00Z on their own day).
// "Today" is the user's local calendar day, expressed the same way.
describe('UTC calendar dates', () => {
  const day = (iso: string) => new Date(iso)

  it('expresses the local calendar day as a UTC calendar date', () => {
    // Late on Oct 31 in the browser's zone is already Nov 1 in UTC west of
    // Greenwich; today is still Oct 31.
    expect(todayAsUtcDate(new Date(2026, 9, 31, 22, 30)).toISOString()).toBe(
      '2026-10-31T00:00:00.000Z'
    )
    expect(todayAsUtcDate(new Date(2026, 10, 1, 0, 30)).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z'
    )
  })

  it('snaps a stored date to its calendar day at UTC midnight', () => {
    const snapped = (iso: string) => toCalendarDay(day(iso)).toISOString()
    // New rows
    expect(snapped('2026-03-01T00:00:00.000Z')).toBe('2026-03-01T00:00:00.000Z')
    // Pre-#58 rows from Uruguay (UTC-3, and UTC-2 in the old summer time)
    expect(snapped('2026-03-01T03:00:00.000Z')).toBe('2026-03-01T00:00:00.000Z')
    expect(snapped('2015-01-01T02:00:00.000Z')).toBe('2015-01-01T00:00:00.000Z')
    // Pre-#58 rows from a browser east of UTC (local midnight Mar 1)
    expect(snapped('2026-02-28T23:00:00.000Z')).toBe('2026-03-01T00:00:00.000Z')
    expect(snapped('2026-02-28T22:00:00.000Z')).toBe('2026-03-01T00:00:00.000Z')
  })

  it('counts whole calendar days between a new row and a pre-#58 row', () => {
    expect(
      calendarDaysBetween(
        day('2026-03-01T00:00:00.000Z'),
        day('2026-03-03T03:00:00.000Z')
      )
    ).toBe(2)
    expect(
      calendarDaysBetween(
        day('2026-03-03T00:00:00.000Z'),
        day('2026-03-01T03:00:00.000Z')
      )
    ).toBe(2)
  })

  it('a month period holds the 1st and the last day, in both stored shapes', () => {
    const rows = [
      { id: 'feb28', date: day('2026-02-28T00:00:00.000Z') },
      { id: 'feb28-legacy', date: day('2026-02-28T03:00:00.000Z') },
      { id: 'mar1', date: day('2026-03-01T00:00:00.000Z') },
      { id: 'mar1-legacy', date: day('2026-03-01T03:00:00.000Z') },
      { id: 'mar31', date: day('2026-03-31T00:00:00.000Z') },
      { id: 'mar31-legacy', date: day('2026-03-31T03:00:00.000Z') },
      { id: 'apr1', date: day('2026-04-01T00:00:00.000Z') },
      { id: 'apr1-legacy', date: day('2026-04-01T03:00:00.000Z') },
    ]
    const march = filterByPeriod(
      rows,
      'date',
      'month',
      new Date(Date.UTC(2026, 2, 15))
    )
    expect(march.map((r) => r.id)).toEqual([
      'mar1',
      'mar1-legacy',
      'mar31',
      'mar31-legacy',
    ])
    expect(new Set(march.map((r) => toMonthKey(r.date)))).toEqual(
      new Set(['2026-03'])
    )
  })

  it('late on the last local day of a month, "este mes" is still that month', () => {
    const lateMarch31 = new Date(2026, 2, 31, 22, 30)
    const options = generatePeriodOptions([], lateMarch31)
    const thisMonth = options.find((o) => o.id === 'this-month')!
    expect(thisMonth.label).toMatch(/Este mes \(mar/i)
    const rows = [
      { id: 'mar31', date: day('2026-03-31T00:00:00.000Z') },
      { id: 'apr1', date: day('2026-04-01T00:00:00.000Z') },
    ]
    expect(
      filterByPeriod(rows, 'date', thisMonth.period, thisMonth.referenceDate)
    ).toEqual([rows[0]])
  })

  it('a previous-year option needs a row whose calendar day is in that year', () => {
    // Jan 1 2025 at UTC midnight is still Dec 31 2024 local in Uruguay.
    const options = generatePeriodOptions(
      [day('2025-01-01T00:00:00.000Z')],
      new Date(2025, 5, 15, 12)
    )
    expect(options.map((o) => o.id)).not.toContain('year-2024')
  })
})
