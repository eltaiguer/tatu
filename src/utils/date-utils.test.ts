// Tests for date utility functions

import { describe, it, expect } from 'vitest'
import {
  todayAsUtcDate,
  toCalendarDay,
  calendarDaysBetween,
} from './date-utils'

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
})
