import {
  isValid,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';

export type Period = 'week' | 'month' | 'quarter' | 'year';

function getPeriodStart(period: Period, referenceDate: Date): Date {
  switch (period) {
    case 'week':
      return startOfWeek(referenceDate, { weekStartsOn: 1 });
    case 'month':
      return startOfMonth(referenceDate);
    case 'quarter':
      return startOfQuarter(referenceDate);
    case 'year':
      return startOfYear(referenceDate);
    default:
      return startOfMonth(referenceDate);
  }
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return isValid(parsed) ? parsed : null;
  }

  return null;
}

export function filterByPeriod<T extends Record<string, unknown>>(
  items: T[],
  dateKey: keyof T,
  period: Period,
  now: Date = new Date()
): T[] {
  const periodStart = getPeriodStart(period, now);

  return items.filter((item) => {
    const date = toDate(item[dateKey]);
    if (!date) {
      return false;
    }

    return date >= periodStart && date <= now;
  });
}
