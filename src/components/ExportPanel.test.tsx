import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExportPanel } from './ExportPanel'
import type { Transaction } from '../models'
import { exportTransactions } from '../services/export/export'

vi.mock('../services/export/export', () => ({
  exportTransactions: vi.fn(),
}))

function makeTransaction(id: string): Transaction {
  return {
    id,
    date: new Date('2025-01-01T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

describe('ExportPanel', () => {
  it('exports with scope, format, and date range', () => {
    const allTransactions = [makeTransaction('tx-1')]
    const filteredTransactions = [makeTransaction('tx-2')]

    render(
      <ExportPanel
        allTransactions={allTransactions}
        filteredTransactions={filteredTransactions}
        fileName="report"
      />
    )

    fireEvent.change(screen.getByLabelText('Export scope'), {
      target: { value: 'all' },
    })
    fireEvent.change(screen.getByLabelText('Export format'), {
      target: { value: 'pdf' },
    })
    fireEvent.change(screen.getByLabelText('Export from'), {
      target: { value: '2025-01-05' },
    })
    fireEvent.change(screen.getByLabelText('Export to'), {
      target: { value: '2025-01-10' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(exportTransactions).toHaveBeenCalledWith(allTransactions, {
      format: 'pdf',
      fileName: 'report',
      dateFrom: new Date('2025-01-05T00:00:00.000Z'),
      dateTo: new Date('2025-01-10T23:59:59.999Z'),
    })
  })
})
