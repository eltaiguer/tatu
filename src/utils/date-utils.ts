// Date utility functions for period filtering

import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  isWithinInterval
} from 'date-fns';

export type Period = 'week' | 'month' | 'quarter' | 'year';

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get the date range for a given period
 * @param period - The period type (week, month, quarter, year)
 * @param referenceDate - The reference date (defaults to today)
 * @returns Object with start and end dates
 */
export function getDateRangeForPeriod(
  period: Period,
  referenceDate: Date = new Date()
): DateRange {
  switch (period) {
    case 'week':
      return {
        start: startOfWeek(referenceDate, { weekStartsOn: 1 }), // Monday
        end: endOfWeek(referenceDate, { weekStartsOn: 1 }),
      };
    case 'month':
      return {
        start: startOfMonth(referenceDate),
        end: endOfMonth(referenceDate),
      };
    case 'quarter':
      return {
        start: startOfQuarter(referenceDate),
        end: endOfQuarter(referenceDate),
      };
    case 'year':
      return {
        start: startOfYear(referenceDate),
        end: endOfYear(referenceDate),
      };
    default:
      throw new Error(`Invalid period: ${period}`);
  }
}

/**
 * Check if a date is within a given period
 * @param date - The date to check
 * @param period - The period type
 * @param referenceDate - The reference date (defaults to today)
 * @returns True if the date is within the period
 */
export function isDateInPeriod(
  date: Date,
  period: Period,
  referenceDate: Date = new Date()
): boolean {
  const range = getDateRangeForPeriod(period, referenceDate);
  return isWithinInterval(date, { start: range.start, end: range.end });
}

/**
 * Filter an array of items by date property within a period
 * @param items - Array of items to filter
 * @param dateKey - The key of the date property
 * @param period - The period type
 * @param referenceDate - The reference date (defaults to today)
 * @returns Filtered array of items
 */
export function filterByPeriod<T>(
  items: T[],
  dateKey: keyof T,
  period: Period,
  referenceDate: Date = new Date()
): T[] {
  const range = getDateRangeForPeriod(period, referenceDate);

  return items.filter((item) => {
    const itemDate = item[dateKey];
    if (!(itemDate instanceof Date)) {
      return false;
    }
    return isWithinInterval(itemDate, { start: range.start, end: range.end });
  });
}
