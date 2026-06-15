import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import type { Transaction } from '../models'
import { Category } from '../models'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

describe('Dashboard', () => {
  it('shows empty state with import CTA when there are no transactions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'))

    render(<Dashboard transactions={[]} />)

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.getByText('Empezá importando tu extracto')).toBeInTheDocument()
    expect(screen.queryByText('Panel General')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows converted+combined totals in home currency', () => {
    const transactions = [
      makeTransaction({ id: 'uyu-debit', currency: 'UYU', type: 'debit', amount: 1000 }),
      makeTransaction({ id: 'usd-debit', currency: 'USD', type: 'debit', amount: 50 }),
      makeTransaction({ id: 'usd-credit', currency: 'USD', type: 'credit', amount: 200, category: Category.Income }),
    ]

    // homeCurrency defaults to 'USD', fxRate defaults to 40.5
    // income = 200 USD (only Category.Income credits count), expenses = 50 USD + 1000/40 ≈ 25 USD
    render(<Dashboard transactions={transactions} homeCurrency="USD" fxRate={40} />)

    // income = 200 USD appears in "Este mes" panel
    expect(screen.getByText('US$ 200,00')).toBeInTheDocument()
    // UYU transaction native amount appears in recent list
    expect(screen.getAllByText('$U 1.000,00').length).toBeGreaterThan(0)
    // Converted secondary line appears for the UYU tx (≈ USD)
    expect(screen.getAllByText(/≈ US\$/).length).toBeGreaterThan(0)
  })

  it('does not count transfer debits as expenses in converted totals', () => {
    const transactions = [
      makeTransaction({
        id: 'normal-expense',
        currency: 'USD',
        type: 'debit',
        amount: 50,
        category: Category.Groceries,
      }),
      makeTransaction({
        id: 'internal-transfer',
        currency: 'USD',
        type: 'debit',
        amount: 100,
        category: Category.Transfer,
      }),
    ]

    // homeCurrency=USD, so expense total = 50 (transfer excluded)
    render(<Dashboard transactions={transactions} homeCurrency="USD" fxRate={40} />)

    // 50 appears (native + converted total)
    expect(screen.getAllByText('US$ 50,00').length).toBeGreaterThan(0)
    // 150 should NOT appear (transfer excluded from totals)
    expect(screen.queryByText('US$ 150,00')).not.toBeInTheDocument()
  })
})
