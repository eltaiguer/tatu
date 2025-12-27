import type { Transaction } from '../../models'
import { applyFilters } from '../filters/filters'

export type ExportFormat = 'csv' | 'pdf'

export interface ExportOptions {
  format: ExportFormat
  fileName?: string
  dateFrom?: Date
  dateTo?: Date
}

export interface PdfReportOptions {
  title?: string
  generatedAt?: Date
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildCsv(transactions: Transaction[]): string {
  const header = [
    'Date',
    'Description',
    'Amount',
    'Currency',
    'Type',
    'Category',
  ]
  const rows = transactions.map((tx) => [
    tx.date.toISOString().slice(0, 10),
    tx.description,
    tx.amount.toFixed(2),
    tx.currency,
    tx.type,
    tx.category ?? 'Uncategorized',
  ])

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

export function filterTransactionsForExport(
  transactions: Transaction[],
  options: { dateFrom?: Date; dateTo?: Date }
): Transaction[] {
  return applyFilters(transactions, {
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  })
}

export function buildPdfReportHtml(
  transactions: Transaction[],
  options: PdfReportOptions = {}
): string {
  const title = options.title ?? 'Tatu Export Report'
  const generatedAt = options.generatedAt ?? new Date()

  const rows = transactions
    .map(
      (tx) => `
        <tr>
          <td>${tx.date.toISOString().slice(0, 10)}</td>
          <td>${tx.description}</td>
          <td>${tx.amount.toFixed(2)}</td>
          <td>${tx.currency}</td>
          <td>${tx.type}</td>
          <td>${tx.category ?? 'Uncategorized'}</td>
        </tr>
      `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: "Inter", "Segoe UI", sans-serif; margin: 24px; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { color: #555; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
          th { background: #f6f6f6; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated ${generatedAt.toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Type</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `
}

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = `${fileName}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function openPrintWindow(html: string) {
  if (typeof window === 'undefined') {
    return
  }

  const printWindow = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWindow) {
    return
  }

  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

export function exportTransactions(
  transactions: Transaction[],
  options: ExportOptions
) {
  const filtered = filterTransactionsForExport(transactions, {
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  })

  const fileName = options.fileName ?? 'tatu-export'

  if (options.format === 'csv') {
    const csv = buildCsv(filtered)
    downloadCsv(csv, fileName)
    return
  }

  const html = buildPdfReportHtml(filtered, { title: fileName })
  openPrintWindow(html)
}
