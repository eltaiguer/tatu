import { describe, it, expect, vi } from 'vitest'
import type { Transaction } from '../../models'
import {
  buildCsv,
  buildPdfReportHtml,
  filterTransactionsForExport,
  exportTransactions,
} from './export'

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
    rawData: {},
    ...overrides,
  }
}

describe('Export helpers', () => {
  it('builds CSV output with headers', () => {
    const transactions = [
      makeTransaction('tx-1', {
        description: 'Netflix',
        amount: 12.5,
        category: 'Entertainment',
      }),
    ]

    const csv = buildCsv(transactions)

    expect(csv).toContain(
      '"Date","Description","Amount","Currency","Type","Category"'
    )
    expect(csv).toContain(
      '"2025-01-01","Netflix","12.50","USD","debit","Entertainment"'
    )
  })

  it('filters transactions by date range for export', () => {
    const transactions = [
      makeTransaction('tx-1', { date: new Date('2025-01-01T00:00:00.000Z') }),
      makeTransaction('tx-2', { date: new Date('2025-02-01T00:00:00.000Z') }),
    ]

    const filtered = filterTransactionsForExport(transactions, {
      dateFrom: new Date('2025-01-15T00:00:00.000Z'),
      dateTo: new Date('2025-02-15T00:00:00.000Z'),
    })

    expect(filtered.map((tx) => tx.id)).toEqual(['tx-2'])
  })

  it('builds printable PDF HTML output', () => {
    const transactions = [makeTransaction('tx-1', { description: 'Devoto' })]

    const html = buildPdfReportHtml(transactions, {
      title: 'Export Report',
    })

    expect(html).toContain('<table')
    expect(html).toContain('Devoto')
    expect(html).toContain('Export Report')
  })

  it('opens a print window for PDF exports', () => {
    const openSpy = vi.fn(() => ({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
    })) as unknown as typeof window.open

    const originalOpen = window.open
    window.open = openSpy

    exportTransactions([makeTransaction('tx-1')], {
      format: 'pdf',
      fileName: 'report',
    })

    expect(openSpy).toHaveBeenCalled()

    window.open = originalOpen
  })
})
