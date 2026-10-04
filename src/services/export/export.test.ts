import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../models'
import { buildCsv, buildPdfReportHtml, exportTransactions } from './export'
import { captureCsvDownload } from '../../test/csv-download'
import { capturePrintFrame } from '../../test/print-frame'
import { UserFacingError } from '../../utils/user-error'

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
      '"2025-01-01","Netflix","12.50","USD","debit","Entretenimiento","1"'
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
        .filter((row) => row[flag] === '1')
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

  it('prints the PDF report from a hidden frame instead of a popup (#179)', () => {
    const frame = capturePrintFrame()
    try {
      const written = exportTransactions(
        [makeTransaction('tx-1', { description: 'Devoto Pocitos' })],
        { format: 'pdf', fileName: 'report' }
      )

      expect(written).toBe(1)
      // window.open with noopener returns null per spec — never the path.
      expect(frame.openSpy).not.toHaveBeenCalled()
      expect(frame.printed()).toHaveLength(1)
      expect(frame.printed()[0]).toContain('Devoto Pocitos')
    } finally {
      frame.restore()
    }
  })

  it('reports a user-facing error when the PDF report cannot open (#179)', () => {
    const frame = capturePrintFrame({ failing: true })
    try {
      expect(() =>
        exportTransactions([makeTransaction('tx-1')], { format: 'pdf' })
      ).toThrow(UserFacingError)
      expect(frame.printed()).toHaveLength(0)
    } finally {
      frame.restore()
    }
  })

  it('renders descriptions and the title as text, not HTML (#179)', () => {
    const description = `<script>alert(1)</script> Pan & Co "x" 'y'`
    const html = buildPdfReportHtml(
      [makeTransaction('tx-1', { description })],
      {
        title: 'Gastos <b>2026</b> & más',
      }
    )

    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.querySelector('b')).toBeNull()
    expect(doc.title).toBe('Gastos <b>2026</b> & más')
    expect(doc.querySelector('h1')?.textContent).toBe(
      'Gastos <b>2026</b> & más'
    )
    const cells = [...doc.querySelectorAll('tbody td')].map(
      (td) => td.textContent
    )
    expect(cells).toContain(description)
    expect(html).toContain('Pan &amp; Co')
  })
})

// #58: the exported date is the row's calendar day, for rows stored at UTC
// midnight and for rows stored before #58 at 03:00Z.
describe('exported dates', () => {
  it('writes each row on its own calendar day', () => {
    const csv = buildCsv([
      makeTransaction('new', { date: new Date('2026-03-01T00:00:00.000Z') }),
      makeTransaction('pre-58', {
        date: new Date('2026-03-31T03:00:00.000Z'),
      }),
    ])
    const dates = csv
      .split('\n')
      .slice(1)
      .map((line) => line.split(',')[0].replace(/"/g, ''))
    expect(dates).toEqual(['2026-03-01', '2026-03-31'])
    const html = buildPdfReportHtml([
      makeTransaction('new', { date: new Date('2026-03-01T00:00:00.000Z') }),
    ])
    expect(html).toContain('<td>2026-03-01</td>')
  })
})
