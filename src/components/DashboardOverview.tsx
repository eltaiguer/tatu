import { useEffect, useMemo, useState } from 'react'
import { calculateTotals } from '../services/aggregator/aggregation'
import type { Transaction } from '../models'

type PeriodOption = 'this_month' | 'last_month' | 'custom'

interface DashboardOverviewProps {
  transactions: Transaction[]
  onPeriodChange?: (range: { dateFrom?: Date; dateTo?: Date }) => void
  now?: Date
}

function toUtcDateStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toUtcDateEnd(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
}

function getMonthRange(date: Date): { dateFrom: Date; dateTo: Date } {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const dateFrom = new Date(Date.UTC(year, month, 1))
  const dateTo = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  return { dateFrom, dateTo }
}

function getLastMonthRange(date: Date): { dateFrom: Date; dateTo: Date } {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() - 1
  const dateFrom = new Date(Date.UTC(year, month, 1))
  const dateTo = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
  return { dateFrom, dateTo }
}

function formatTotals(usd: number, uyu: number): string {
  return `${usd.toFixed(2)} USD / ${uyu.toFixed(2)} UYU`
}

export function DashboardOverview({
  transactions,
  onPeriodChange,
  now,
}: DashboardOverviewProps) {
  const [period, setPeriod] = useState<PeriodOption>('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const totals = useMemo(() => calculateTotals(transactions), [transactions])
  const referenceDate = useMemo(() => now ?? new Date(), [now])

  useEffect(() => {
    if (!onPeriodChange) {
      return
    }

    if (period === 'this_month') {
      onPeriodChange(getMonthRange(referenceDate))
      return
    }

    if (period === 'last_month') {
      onPeriodChange(getLastMonthRange(referenceDate))
      return
    }

    const dateFrom = customStart ? toUtcDateStart(customStart) : undefined
    const dateTo = customEnd ? toUtcDateEnd(customEnd) : undefined
    onPeriodChange({ dateFrom, dateTo })
  }, [period, customStart, customEnd, onPeriodChange, referenceDate])

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
            Overview
          </p>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Financial Summary
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              period === 'this_month'
                ? 'bg-gray-900 text-white'
                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            }`}
            onClick={() => setPeriod('this_month')}
          >
            This month
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              period === 'last_month'
                ? 'bg-gray-900 text-white'
                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            }`}
            onClick={() => setPeriod('last_month')}
          >
            Last month
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              period === 'custom'
                ? 'bg-gray-900 text-white'
                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            }`}
            onClick={() => setPeriod('custom')}
          >
            Custom
          </button>
        </div>
      </div>

      {period === 'custom' ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="date"
            value={customStart}
            onChange={(event) => setCustomStart(event.target.value)}
            data-testid="period-start"
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(event) => setCustomEnd(event.target.value)}
            data-testid="period-end"
            className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400">Total Income</p>
          <p className="font-mono mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatTotals(totals.income.USD, totals.income.UYU)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400">Total Expenses</p>
          <p className="font-mono mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatTotals(totals.expense.USD, totals.expense.UYU)}
          </p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400">Net</p>
          <p className="font-mono mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatTotals(totals.net.USD, totals.net.UYU)}
          </p>
        </div>
      </div>
    </section>
  )
}
