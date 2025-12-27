import { useCallback, useState } from 'react'
import type { ParsedData } from '../models'
import { Category, CATEGORY_LABELS, getAllCategories } from '../models'
import {
  applyFilters,
  sortTransactions,
  type FilterOptions,
} from '../services/filters/filters'
import { DashboardOverview } from './DashboardOverview'
import { ChartsSection } from './ChartsSection'
import { TransactionList } from './TransactionList'

interface ParsedDataDisplayProps {
  data: ParsedData
  onReset: () => void
  onCategoryChange: (transactionId: string, category: Category) => void
}

export function ParsedDataDisplay({
  data,
  onReset,
  onCategoryChange,
}: ParsedDataDisplayProps) {
  const metadata = data.metadata
  const categories = getAllCategories()
  const [filters, setFilters] = useState<FilterOptions>({})
  const handlePeriodChange = useCallback(
    ({ dateFrom, dateTo }: { dateFrom?: Date; dateTo?: Date }) =>
      setFilters((current) => ({
        ...current,
        dateFrom,
        dateTo,
      })),
    []
  )

  const filteredTransactions = applyFilters(data.transactions, filters)
  const sortedTransactions = sortTransactions(filteredTransactions)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Parsed Data
        </h2>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Upload Another File
        </button>
      </div>

      {/* File Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          File Information
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">File:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
              {data.fileName}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Type:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
              {data.fileType.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">
              Transactions:
            </span>
            <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
              {sortedTransactions.length}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">
              Parsed At:
            </span>
            <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
              {data.parsedAt.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Account Metadata
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {'cliente' in metadata && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Client:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {metadata.cliente}
              </span>
            </div>
          )}

          {'numeroTarjeta' in metadata && (
            <>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Card Number:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.numeroTarjeta}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Card Alias:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.alias}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Statement Period:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.periodoDesde} - {metadata.periodoHasta}
                </span>
              </div>
            </>
          )}

          {'moneda' in metadata && (
            <>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Account:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.cuenta}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Number:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.numero}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Currency:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.moneda}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Period:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {metadata.periodoDesde} - {metadata.periodoHasta}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <DashboardOverview
        transactions={sortedTransactions}
        onPeriodChange={handlePeriodChange}
      />

      <ChartsSection transactions={sortedTransactions} />

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Search
            </label>
            <input
              type="text"
              value={filters.query ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  query: event.target.value || undefined,
                }))
              }
              placeholder="Search description"
              className="w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
            />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Category
            </label>
            <select
              value={filters.categories?.[0] ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setFilters((current) => ({
                  ...current,
                  categories: value ? [value] : undefined,
                }))
              }}
              className="w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
              Currency
            </label>
            <select
              value={filters.currencies?.[0] ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setFilters((current) => ({
                  ...current,
                  currencies: value ? [value as 'USD' | 'UYU'] : undefined,
                }))
              }}
              className="w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700"
            >
              <option value="">All currencies</option>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </div>
        </div>
      </div>

      <TransactionList
        transactions={sortedTransactions}
        onCategoryChange={onCategoryChange}
      />

    </div>
  )
}
