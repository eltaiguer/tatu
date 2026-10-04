import type { Transaction } from '../../models'
import { getCategoryDisplay } from '../../utils/category-display'
import { countsTowardTotals } from '../spending/spending-rules'
import { UserFacingError } from '../../utils/user-error'

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

// Whether the row counts toward totals (1) or not (0), so summing the 1 rows
// in a spreadsheet gives the app's totals: a split parent and its parts are
// both in the file, only the parts count. 1/0 rather than sí/no survives any
// encoding and locale, and multiplies straight into SUMPRODUCT.
export const COUNTS_TOWARD_TOTALS_HEADER = 'cuenta_en_totales'

function countsLabel(tx: Transaction): string {
  return countsTowardTotals(tx) ? '1' : '0'
}

// Every string interpolated into the PDF report goes through this:
// descriptions and custom category names are user data and print as text.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  const title = escapeHtml(options.title ?? 'Tatu Export Report')
  const generatedAt = escapeHtml(
    (options.generatedAt ?? new Date()).toLocaleString()
  )

  const rows = transactions
    .map(
      (tx) => `
        <tr>
          <td>${escapeHtml(tx.date.toISOString().slice(0, 10))}</td>
          <td>${escapeHtml(tx.description)}</td>
          <td>${escapeHtml(tx.amount.toFixed(2))}</td>
          <td>${escapeHtml(tx.currency)}</td>
          <td>${escapeHtml(tx.type)}</td>
          <td>${escapeHtml(getExportCategoryLabel(tx.category))}</td>
          <td>${escapeHtml(countsLabel(tx))}</td>
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
        <p>Generated ${generatedAt}</p>
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

const PRINT_FRAME_ATTR = 'data-tatu-print-frame'

const PDF_OPEN_ERROR =
  'No se pudo abrir el reporte PDF. Recargá la página e intentá de nuevo.'

// Prints from a hidden same-origin iframe rather than a popup: no popup
// blocker can stop it, and it sidesteps window.open with `noopener`, which
// returns null per spec — why the old popup never opened (#179). Throws a
// UserFacingError when the frame can't be written or printed.
function printReport(html: string) {
  if (typeof document === 'undefined') {
    throw new UserFacingError(PDF_OPEN_ERROR)
  }

  // A previous export's frame, left behind if afterprint never fired.
  document.querySelectorAll(`iframe[${PRINT_FRAME_ATTR}]`).forEach((old) => {
    old.remove()
  })

  const frame = document.createElement('iframe')
  frame.setAttribute(PRINT_FRAME_ATTR, '')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Not display:none — browsers print a blank page from an undisplayed frame.
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)

  try {
    const printWindow = frame.contentWindow
    if (!printWindow) {
      throw new Error('print frame has no window')
    }
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.addEventListener('afterprint', () => frame.remove())
    printWindow.focus()
    printWindow.print()
  } catch {
    frame.remove()
    throw new UserFacingError(PDF_OPEN_ERROR)
  }
}

// Writes exactly the rows it is given — callers decide which (Configuración
// exports every row as a backup, Transacciones the rows on screen). Returns
// how many rows it wrote (for PDF, how many it sent to the print dialog);
// throws a UserFacingError when the PDF report can't be opened.
export function exportTransactions(
  transactions: Transaction[],
  options: ExportOptions
): number {
  const fileName = options.fileName ?? 'tatu-export'

  if (options.format === 'csv') {
    downloadCsv(buildCsv(transactions), fileName)
  } else {
    printReport(buildPdfReportHtml(transactions, { title: fileName }))
  }
  return transactions.length
}
