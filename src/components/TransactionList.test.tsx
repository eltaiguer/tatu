import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionList } from './TransactionList'
import type { Transaction } from '../models'
import { Category } from '../models'

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2025-01-01T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    category: Category.Groceries,
    rawData: {},
    ...overrides,
  }
}

describe('TransactionList', () => {
  it('renders table headers and category badge', () => {
    const transactions = [makeTransaction('tx-1')]
    render(<TransactionList transactions={transactions} />)

    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('🛒')).toBeInTheDocument()
  })

  it('paginates transactions', () => {
    const transactions = Array.from({ length: 12 }, (_, index) =>
      makeTransaction(`tx-${index + 1}`, { description: `Row ${index + 1}` })
    )

    render(<TransactionList transactions={transactions} pageSize={10} />)

    expect(screen.getAllByTestId('transaction-row')).toHaveLength(10)

    fireEvent.click(screen.getByText('Next'))
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(2)
  })

  it('sorts by amount when clicking header', () => {
    const transactions = [
      makeTransaction('tx-1', { amount: 50 }),
      makeTransaction('tx-2', { amount: 10 }),
    ]

    render(<TransactionList transactions={transactions} />)

    fireEvent.click(screen.getByText('Amount'))

    const rows = screen.getAllByTestId('transaction-row')
    expect(rows[0]).toHaveTextContent('50.00')

    fireEvent.click(screen.getByText('Amount'))

    const ascRows = screen.getAllByTestId('transaction-row')
    expect(ascRows[0]).toHaveTextContent('10.00')
  })

  it('virtualizes rows to a smaller window', () => {
    const transactions = Array.from({ length: 30 }, (_, index) =>
      makeTransaction(`tx-${index + 1}`, { description: `Row ${index + 1}` })
    )

    render(<TransactionList transactions={transactions} pageSize={30} />)

    const rows = screen.getAllByTestId('transaction-row')
    expect(rows.length).toBeLessThan(30)
  })

  it('highlights search matches in descriptions', () => {
    const transactions = [
      makeTransaction('tx-1', { description: 'Devoto Supermercado' }),
    ]

    render(<TransactionList transactions={transactions} highlightQuery="dev" />)

    const highlight = screen.getByTestId('search-highlight')
    expect(highlight).toHaveTextContent('Dev')
  })

  it('shows empty state when there are no transactions', () => {
    render(<TransactionList transactions={[]} />)

    expect(screen.getByText('No transactions to display')).toBeInTheDocument()
  })
})
