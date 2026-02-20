import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Charts } from './Charts'
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
    category: 'food',
    rawData: {},
    ...overrides,
  }
}

describe('Charts', () => {
  it('does not show NaN/Infinity when there are no expense transactions', () => {
    const transactions = [
      makeTransaction({
        id: 'credit-only',
        type: 'credit',
        amount: 300,
        category: 'income',
      }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })

  it('renders category breakdown from expense data', () => {
    const transactions = [
      makeTransaction({ id: 'food-1', category: 'food', amount: 100 }),
      makeTransaction({ id: 'food-2', category: 'food', amount: 50 }),
      makeTransaction({ id: 'transport-1', category: 'transport', amount: 30 }),
    ]

    render(<Charts transactions={transactions} />)

    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Transporte').length).toBeGreaterThan(0)
  })
})
