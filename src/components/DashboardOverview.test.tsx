import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DashboardOverview } from './DashboardOverview'
import type { Transaction } from '../models'

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2025-03-10T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

describe('DashboardOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders summary totals with multi-currency values', () => {
    const transactions = [
      makeTransaction('tx-1', {
        amount: 100,
        type: 'credit',
        currency: 'USD',
      }),
      makeTransaction('tx-2', {
        amount: 40,
        type: 'debit',
        currency: 'USD',
      }),
      makeTransaction('tx-3', {
        amount: 50,
        type: 'debit',
        currency: 'UYU',
      }),
    ]

    render(<DashboardOverview transactions={transactions} />)

    expect(screen.getByText('Total Income')).toBeInTheDocument()
    expect(screen.getByText('Total Expenses')).toBeInTheDocument()
    expect(screen.getByText('Net')).toBeInTheDocument()

    expect(screen.getByText('100.00 USD / 0.00 UYU')).toBeInTheDocument()
    expect(screen.getByText('40.00 USD / 50.00 UYU')).toBeInTheDocument()
    expect(screen.getByText('60.00 USD / -50.00 UYU')).toBeInTheDocument()
  })

  it('emits date range for last month selection', async () => {
    const onPeriodChange = vi.fn()
    const now = new Date('2025-03-15T00:00:00.000Z')

    render(
      <DashboardOverview
        transactions={[]}
        onPeriodChange={onPeriodChange}
        now={now}
      />
    )

    fireEvent.click(screen.getByText('Last month'))

    await waitFor(() => {
      const [range] =
        onPeriodChange.mock.calls[onPeriodChange.mock.calls.length - 1] ?? []
      expect(range.dateFrom.toISOString()).toBe('2025-02-01T00:00:00.000Z')
      expect(range.dateTo.toISOString()).toBe('2025-02-28T23:59:59.999Z')
    })
  })

  it('emits date range for custom selection', async () => {
    const onPeriodChange = vi.fn()
    const now = new Date('2025-03-15T00:00:00.000Z')

    render(
      <DashboardOverview
        transactions={[]}
        onPeriodChange={onPeriodChange}
        now={now}
      />
    )

    fireEvent.click(screen.getByText('Custom'))

    const startInput = screen.getByTestId('period-start')
    const endInput = screen.getByTestId('period-end')

    fireEvent.change(startInput, { target: { value: '2025-03-05' } })
    fireEvent.change(endInput, { target: { value: '2025-03-20' } })

    await waitFor(() => {
      const [range] =
        onPeriodChange.mock.calls[onPeriodChange.mock.calls.length - 1] ?? []
      expect(range.dateFrom.toISOString()).toBe('2025-03-05T00:00:00.000Z')
      expect(range.dateTo.toISOString()).toBe('2025-03-20T23:59:59.999Z')
    })
  })
})
