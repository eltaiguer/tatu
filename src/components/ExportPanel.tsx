import { useState } from 'react'
import type { Transaction } from '../models'
import {
  exportTransactions,
  type ExportFormat,
} from '../services/export/export'

interface ExportPanelProps {
  allTransactions: Transaction[]
  filteredTransactions: Transaction[]
  fileName?: string
}

function toUtcDateStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toUtcDateEnd(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
}

export function ExportPanel({
  allTransactions,
  filteredTransactions,
  fileName = 'tatu-export',
}: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [scope, setScope] = useState<'filtered' | 'all'>('filtered')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  const handleExport = () => {
    const transactions =
      scope === 'all' ? allTransactions : filteredTransactions

    exportTransactions(transactions, {
      format,
      fileName,
      dateFrom: dateFrom ? toUtcDateStart(dateFrom) : undefined,
      dateTo: dateTo ? toUtcDateEnd(dateTo) : undefined,
    })
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm space-y-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
            Export
          </p>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Reports & Files
          </h3>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          Export
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-xs text-gray-500">
          Export scope
          <select
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as 'filtered' | 'all')
            }
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
          >
            <option value="filtered">Filtered transactions</option>
            <option value="all">All transactions</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-xs text-gray-500">
          Export format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-2 text-xs text-gray-500">
            Export from
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-200"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs text-gray-500">
            Export to
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-200"
            />
          </label>
        </div>
      </div>
    </section>
  )
}
