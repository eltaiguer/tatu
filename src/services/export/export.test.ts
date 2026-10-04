import { describe, it, expect, vi } from 'vitest'
import type { Transaction } from '../../models'
import { buildCsv, buildPdfReportHtml, exportTransactions } from './export'
import { captureCsvDownload } from '../../test/csv-download'

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
        category: 'entertainment',
      }),
    ]

    const csv = buildCsv(transactions)

    expect(csv).toContain(
      '"Date","Description","Amount","Currency","Type","Category","cuenta_en_totales"'
    )
    expect(csv).toContain(
      '"2025-01-01","Netflix","12.50","USD","debit","Entretenimiento","sí"'
    )
  })

  it('humanizes unknown category labels in printable exports', () => {
    const html = buildPdfReportHtml([
      makeTransaction('tx-1', {
        description: 'Desk lamp',
        category: 'home_office',
      }),
    ])

    expect(html).toContain('Home office')
  })

  it('writes exactly the rows it is given, split parents and ignored rows included', async () => {
    const csv = captureCsvDownload()
    try {
      const written = exportTransactions(
        [
          makeTransaction('parent', { amount: 1000, isSplitParent: true }),
          makeTransaction('trf', { category: 'internal_transfer' }),
          makeTransaction('tx-1', { category: 'groceries' }),
        ],
        { format: 'csv' }
      )

      const [, ...rows] = await csv.rows()
      expect(rows).toHaveLength(3)
      expect(written).toBe(3)
    } finally {
      csv.restore()
    }
  })

  // #124: a split 1,000 → 600 + 400 exported as parent + parts summed to
  // 2,000. Summing only the rows that count toward totals must give 1,000.
  it('flags rows so summing the ones that count gives the real total', async () => {
    const csv = captureCsvDownload()
    try {
      exportTransactions(
        [
          makeTransaction('parent', {
            amount: 1000,
            currency: 'UYU',
            isSplitParent: true,
          }),
          makeTransaction('part-1', {
            amount: 600,
            currency: 'UYU',
            splitParentId: 'parent',
          }),
          makeTransaction('part-2', {
            amount: 400,
            currency: 'UYU',
            splitParentId: 'parent',
          }),
        ],
        { format: 'csv' }
      )

      const [header, ...rows] = await csv.rows()
      const amount = header.indexOf('Amount')
      const flag = header.indexOf('cuenta_en_totales')
      const counted = rows
        .filter((row) => row[flag] === 'sí')
        .reduce((sum, row) => sum + Number(row[amount]), 0)
      expect(counted).toBe(1000)
    } finally {
      csv.restore()
    }
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
