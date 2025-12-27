import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChartsSection } from './ChartsSection'
import type { Transaction } from '../models'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2025-01-01T00:00:00.000Z'),
    description: 'Transaction',
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

describe('ChartsSection', () => {
  it('renders chart headings', () => {
    render(<ChartsSection transactions={[makeTransaction()]} />)

    expect(screen.getByText('Spending by Category')).toBeInTheDocument()
    expect(screen.getByText('Monthly Trends')).toBeInTheDocument()
    expect(screen.getByText('Income vs Expenses')).toBeInTheDocument()
  })

  it('allows switching currency', () => {
    render(<ChartsSection transactions={[makeTransaction()]} />)

    const uyuButton = screen.getByRole('button', { name: 'UYU' })
    fireEvent.click(uyuButton)

    expect(uyuButton).toBeInTheDocument()
  })

  it('shows empty state messaging when no data', () => {
    render(<ChartsSection transactions={[]} />)

    expect(
      screen.getByText('Upload data to see category breakdowns.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'USD' })).toBeDisabled()
  })
})
