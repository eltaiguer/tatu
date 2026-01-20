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
  isWithinInterval,
  getQuarter,
  subMonths,
  format,
} from 'date-fns';
import { es } from 'date-fns/locale';

export type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface PeriodOption {
  id: string;
  label: string;
  period: Period;
  referenceDate?: Date;
}

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
    case 'all':
      return {
        start: new Date(0),
        end: new Date(8640000000000000), // Max date
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
  if (period === 'all') {
    return items;
  }

  const range = getDateRangeForPeriod(period, referenceDate);

  return items.filter((item) => {
    const itemDate = item[dateKey];
    if (!(itemDate instanceof Date)) {
      return false;
    }
    return isWithinInterval(itemDate, { start: range.start, end: range.end });
  });
}

/**
 * Generate dynamic period options based on transaction dates
 * @param transactionDates - Array of transaction dates
 * @param today - Reference date for "current" periods (defaults to now)
 * @returns Array of period options with labels
 */
export function generatePeriodOptions(
  transactionDates: Date[],
  today: Date = new Date()
): PeriodOption[] {
  const options: PeriodOption[] = [];

  // Always show "All" option
  options.push({
    id: 'all',
    label: 'Todo',
    period: 'all',
  });

  // Current week
  options.push({
    id: 'this-week',
    label: 'Esta semana',
    period: 'week',
    referenceDate: today,
  });

  // Current month
  const currentMonthLabel = format(today, 'MMM yyyy', { locale: es });
  options.push({
    id: 'this-month',
    label: `Este mes (${currentMonthLabel})`,
    period: 'month',
    referenceDate: today,
  });

  // Previous month
  const prevMonth = subMonths(today, 1);
  const prevMonthLabel = format(prevMonth, 'MMM yyyy', { locale: es });
  options.push({
    id: 'prev-month',
    label: `Mes anterior (${prevMonthLabel})`,
    period: 'month',
    referenceDate: prevMonth,
  });

  // Current quarter
  const currentQuarter = getQuarter(today);
  const currentYear = today.getFullYear();
  options.push({
    id: `q${currentQuarter}-${currentYear}`,
    label: `Q${currentQuarter} ${currentYear}`,
    period: 'quarter',
    referenceDate: today,
  });

  // Previous quarter (if different from current)
  const prevQuarterDate = subMonths(today, 3);
  const prevQuarter = getQuarter(prevQuarterDate);
  const prevQuarterYear = prevQuarterDate.getFullYear();
  if (prevQuarter !== currentQuarter || prevQuarterYear !== currentYear) {
    options.push({
      id: `q${prevQuarter}-${prevQuarterYear}`,
      label: `Q${prevQuarter} ${prevQuarterYear}`,
      period: 'quarter',
      referenceDate: prevQuarterDate,
    });
  }

  // Current year
  options.push({
    id: `year-${currentYear}`,
    label: `${currentYear}`,
    period: 'year',
    referenceDate: today,
  });

  // Previous year (if transactions exist from that year)
  const prevYear = currentYear - 1;
  const hasTransactionsFromPrevYear = transactionDates.some(
    (d) => d.getFullYear() === prevYear
  );
  if (hasTransactionsFromPrevYear) {
    options.push({
      id: `year-${prevYear}`,
      label: `${prevYear}`,
      period: 'year',
      referenceDate: new Date(prevYear, 6, 1), // Mid-year as reference
    });
  }

  return options;
}
