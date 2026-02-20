import { describe, expect, it } from 'vitest';
import { filterByPeriod } from './date-utils';

describe('filterByPeriod', () => {
  const now = new Date('2026-02-20T12:00:00.000Z');

  const items = [
    { id: 'week', date: new Date('2026-02-19T10:00:00.000Z') },
    { id: 'month', date: new Date('2026-02-05T10:00:00.000Z') },
    { id: 'quarter', date: new Date('2026-01-10T10:00:00.000Z') },
    { id: 'year', date: new Date('2026-01-01T10:00:00.000Z') },
    { id: 'old', date: new Date('2025-12-31T10:00:00.000Z') },
    { id: 'future', date: new Date('2026-03-01T10:00:00.000Z') },
    { id: 'invalid', date: new Date('invalid date') },
  ];

  it('filters by week', () => {
    const filtered = filterByPeriod(items, 'date', 'week', now);

    expect(filtered.map((item) => item.id)).toEqual(['week']);
  });

  it('filters by month', () => {
    const filtered = filterByPeriod(items, 'date', 'month', now);

    expect(filtered.map((item) => item.id)).toEqual(['week', 'month']);
  });

  it('filters by quarter', () => {
    const filtered = filterByPeriod(items, 'date', 'quarter', now);

    expect(filtered.map((item) => item.id)).toEqual(['week', 'month', 'quarter', 'year']);
  });

  it('filters by year', () => {
    const filtered = filterByPeriod(items, 'date', 'year', now);

    expect(filtered.map((item) => item.id)).toEqual(['week', 'month', 'quarter', 'year']);
  });

  it('supports ISO date strings', () => {
    const rows = [
      { id: 'a', createdAt: '2026-02-10T00:00:00.000Z' },
      { id: 'b', createdAt: '2025-12-10T00:00:00.000Z' },
    ];

    const filtered = filterByPeriod(rows, 'createdAt', 'month', now);

    expect(filtered.map((item) => item.id)).toEqual(['a']);
  });
});
