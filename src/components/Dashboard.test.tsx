import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import type { Transaction } from '../models';

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 'tx-id',
    date: overrides.date ?? new Date('2026-02-18T10:00:00.000Z'),
    description: overrides.description ?? 'Test transaction',
    amount: overrides.amount ?? 100,
    currency: overrides.currency ?? 'UYU',
    type: overrides.type ?? 'debit',
    source: overrides.source ?? 'bank_account',
    category: overrides.category,
    categoryConfidence: overrides.categoryConfidence,
    balance: overrides.balance,
    rawData: overrides.rawData ?? {},
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render NaN with empty transactions', () => {
    const { container } = render(<Dashboard transactions={[]} />);

    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('Infinity');
    expect(screen.getByText('Sin movimientos en el período')).toBeInTheDocument();
  });

  it('derives top expense/category from actual transactions', () => {
    const transactions: Transaction[] = [
      makeTransaction({ id: '1', description: 'UBER', amount: 250, category: 'transport' }),
      makeTransaction({ id: '2', description: 'DEVOTO', amount: 100, category: 'groceries' }),
      makeTransaction({ id: '3', description: 'SALARIO', amount: 1000, type: 'credit', category: 'salary' }),
      makeTransaction({ id: '4', description: 'NETFLIX', amount: 50, currency: 'USD', category: 'entertainment' }),
    ];

    render(<Dashboard transactions={transactions} />);

    expect(screen.getByText('UBER')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
  });

  it('updates top expense based on selected period', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const transactions: Transaction[] = [
      makeTransaction({
        id: 'old-month',
        date: new Date('2026-02-03T10:00:00.000Z'),
        description: 'ALQUILER',
        amount: 700,
        category: 'housing',
      }),
      makeTransaction({
        id: 'current-week',
        date: new Date('2026-02-19T10:00:00.000Z'),
        description: 'UBER',
        amount: 250,
        category: 'transport',
      }),
    ];

    render(<Dashboard transactions={transactions} />);

    expect(screen.getByText('ALQUILER')).toBeInTheDocument();

    await act(async () => {
      await user.selectOptions(screen.getByLabelText('Período'), 'week');
    });

    expect(screen.getByText('UBER')).toBeInTheDocument();
    expect(screen.queryByText('ALQUILER')).not.toBeInTheDocument();
  });

  it('recomputes stats when switching currency', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const transactions: Transaction[] = [
      makeTransaction({ id: 'uyu', description: 'SUPERMERCADO', amount: 200, currency: 'UYU', category: 'groceries' }),
      makeTransaction({ id: 'usd', description: 'NETFLIX', amount: 80, currency: 'USD', category: 'entertainment' }),
    ];

    const { container } = render(<Dashboard transactions={transactions} />);

    await act(async () => {
      await user.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    });

    expect(screen.getByText('NETFLIX')).toBeInTheDocument();
    expect(screen.getByText('Entretenimiento')).toBeInTheDocument();
    expect(container.textContent).not.toContain('+12.5%');
    expect(container.textContent).not.toContain('-8.3%');
    expect(container.textContent).not.toContain('TC: $U 40.00');
  });
});
