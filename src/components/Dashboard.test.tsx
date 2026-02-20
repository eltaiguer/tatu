import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Dashboard } from './Dashboard'
import type { Transaction } from '../models'

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
  it('does not render NaN/Infinity when there are no transactions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'))

    render(<Dashboard transactions={[]} />)

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows currency-specific summary when filtered to USD', () => {
    const transactions = [
      makeTransaction({
        id: 'uyu-debit',
        currency: 'UYU',
        type: 'debit',
        amount: 1000,
      }),
      makeTransaction({
        id: 'usd-debit',
        currency: 'USD',
        type: 'debit',
        amount: 50,
      }),
      makeTransaction({
        id: 'usd-credit',
        currency: 'USD',
        type: 'credit',
        amount: 200,
      }),
    ]

    render(<Dashboard transactions={transactions} />)

    const selects = screen.getAllByRole('combobox')
    const currencySelect = selects[1]
    fireEvent.change(currencySelect, { target: { value: 'USD' } })

    expect(screen.getByText('US$ 200,00')).toBeInTheDocument()
    expect(screen.getByText('US$ 50,00')).toBeInTheDocument()
  })
})
