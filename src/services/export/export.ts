import type { Transaction } from '../../models'
import { getCategoryDisplay } from '../../utils/category-display'
import { countsTowardTotals } from '../spending/spending-rules'

export type ExportFormat = 'csv' | 'pdf'

export interface ExportOptions {
  format: ExportFormat
  fileName?: string
}

export interface PdfReportOptions {
  title?: string
  generatedAt?: Date
}

function getExportCategoryLabel(category: string | undefined): string {
  return getCategoryDisplay(category).label
}

// Whether the row counts toward totals, so summing the "sí" rows in a
// spreadsheet gives the app's totals (a split parent and its parts are both
// in the file; only the parts count).
export const COUNTS_TOWARD_TOTALS_HEADER = 'cuenta_en_totales'

function countsLabel(tx: Transaction): string {
  return countsTowardTotals(tx) ? 'sí' : 'no'
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
    COUNTS_TOWARD_TOTALS_HEADER,
  ]
  const rows = transactions.map((tx) => [
    tx.date.toISOString().slice(0, 10),
    tx.description,
    tx.amount.toFixed(2),
    tx.currency,
    tx.type,
    getExportCategoryLabel(tx.category),
    countsLabel(tx),
  ])

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
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
          <td>${getExportCategoryLabel(tx.category)}</td>
          <td>${countsLabel(tx)}</td>
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
              <th>${COUNTS_TOWARD_TOTALS_HEADER}</th>
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

// Writes exactly the rows it is given — callers decide which (Configuración
// exports every row as a backup, Transacciones the rows on screen). Returns
// how many rows were written.
export function exportTransactions(
  transactions: Transaction[],
  options: ExportOptions
): number {
  const fileName = options.fileName ?? 'tatu-export'

  if (options.format === 'csv') {
    downloadCsv(buildCsv(transactions), fileName)
  } else {
    openPrintWindow(buildPdfReportHtml(transactions, { title: fileName }))
  }
  return transactions.length
}
