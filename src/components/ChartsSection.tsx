import { useState } from 'react'
import type { Currency, Transaction } from '../models'
import { CategorySpendingChart } from './charts/CategorySpendingChart'
import { MonthlyTrendsChart } from './charts/MonthlyTrendsChart'
import { IncomeExpenseChart } from './charts/IncomeExpenseChart'

interface ChartsSectionProps {
  transactions: Transaction[]
}

const CURRENCIES: Currency[] = ['USD', 'UYU']

export function ChartsSection({ transactions }: ChartsSectionProps) {
  const [currency, setCurrency] = useState<Currency>('USD')
  const isEmpty = transactions.length === 0

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
            Charts
          </p>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Visual Insights
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {CURRENCIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCurrency(item)}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                currency === item
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
              disabled={isEmpty}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Spending by Category
          </p>
          {isEmpty ? (
            <div className="flex h-64 items-center justify-center text-xs text-gray-500 dark:text-gray-400">
              Upload data to see category breakdowns.
            </div>
          ) : (
            <CategorySpendingChart
              transactions={transactions}
              currency={currency}
            />
          )}
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Monthly Trends
          </p>
          {isEmpty ? (
            <div className="flex h-64 items-center justify-center text-xs text-gray-500 dark:text-gray-400">
              Upload data to see monthly trends.
            </div>
          ) : (
            <MonthlyTrendsChart
              transactions={transactions}
              currency={currency}
            />
          )}
        </div>
        <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Income vs Expenses
          </p>
          {isEmpty ? (
            <div className="flex h-64 items-center justify-center text-xs text-gray-500 dark:text-gray-400">
              Upload data to compare income and expenses.
            </div>
          ) : (
            <IncomeExpenseChart
              transactions={transactions}
              currency={currency}
            />
          )}
        </div>
      </div>
    </section>
  )
}
