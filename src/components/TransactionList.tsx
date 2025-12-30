import { useMemo, useRef, useState, useEffect } from 'react'
import type { Transaction } from '../models'
import { Category } from '../models'
import { sortTransactions, type SortField } from '../services/filters/filters'
import { getMerchantCategoryOverride } from '../services/categorizer/category-overrides'
import { splitHighlight } from '../services/filters/search'
import {
  getCategoryDefinition,
  getCategoryDefinitions,
} from '../services/categories/category-registry'

interface TransactionListProps {
  transactions: Transaction[]
  pageSize?: number
  onCategoryChange?: (transactionId: string, category: string) => void
  highlightQuery?: string
}

const ROW_HEIGHT = 48
const OVERSCAN = 4

export function TransactionList({
  transactions,
  pageSize = 10,
  onCategoryChange,
  highlightQuery,
}: TransactionListProps) {
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const categories = getCategoryDefinitions()

  useEffect(() => {
    if (scrollRef.current) {
      setContainerHeight(scrollRef.current.clientHeight || 400)
    }
  }, [])

  useEffect(() => {
    if (!editingId) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }

      const container = target.closest(
        `[data-category-editor-id="${editingId}"]`
      )
      if (!container) {
        setEditingId(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [editingId])

  const sorted = useMemo(
    () =>
      sortTransactions(transactions, {
        field: sortField,
        direction: sortDirection,
      }),
    [transactions, sortField, sortDirection]
  )

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            No transactions to display
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Try adjusting your filters or upload another statement.
          </p>
        </div>
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageIndex = Math.min(page, totalPages - 1)
  const paged = sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT))
  const visibleCount = Math.min(
    paged.length,
    Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN
  )
  const visibleItems = paged.slice(visibleStart, visibleStart + visibleCount)
  const topSpacer = visibleStart * ROW_HEIGHT
  const bottomSpacer = Math.max(
    0,
    (paged.length - visibleStart - visibleItems.length) * ROW_HEIGHT
  )

  const handleSort = (field: KnownSortField) => {
    if (field === sortField) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Transactions
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <button
            type="button"
            className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1"
            onClick={() => setPage(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
          >
            Prev
          </button>
          <span>
            {pageIndex + 1} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1"
            onClick={() => setPage(Math.min(totalPages - 1, pageIndex + 1))}
            disabled={pageIndex + 1 >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
      <div
        className="max-h-[420px] overflow-y-auto"
        onScroll={(event) =>
          setScrollTop((event.target as HTMLDivElement).scrollTop)
        }
        ref={scrollRef}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('date')}
              >
                Date
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('description')}
              >
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th
                className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('amount')}
              >
                Amount
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Balance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {topSpacer > 0 ? (
              <tr style={{ height: topSpacer }}>
                <td colSpan={6} />
              </tr>
            ) : null}
            {visibleItems.map((tx) => {
              const override = getMerchantCategoryOverride(tx.description)
              const categoryId =
                override ?? tx.category ?? Category.Uncategorized
              const definition = getCategoryDefinition(categoryId)
              return (
                <tr
                  key={tx.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 h-12"
                  data-testid="transaction-row"
                >
                  <td className="font-mono px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-100">
                    {tx.date.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-gray-900 dark:text-gray-100">
                    {splitHighlight(tx.description, highlightQuery ?? '').map(
                      (segment, index) =>
                        segment.isMatch ? (
                          <mark
                            key={`${tx.id}-match-${index}`}
                            className="rounded bg-amber-100 px-1 text-gray-900 dark:bg-amber-400/40 dark:text-gray-100"
                            data-testid="search-highlight"
                          >
                            {segment.text}
                          </mark>
                        ) : (
                          <span key={`${tx.id}-text-${index}`}>
                            {segment.text}
                          </span>
                        )
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {onCategoryChange ? (
                      <div
                        className="relative inline-flex"
                        data-category-editor-id={tx.id}
                      >
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md ${
                            editingId === tx.id
                              ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                          onClick={() =>
                            setEditingId(editingId === tx.id ? null : tx.id)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              setEditingId(null)
                            }
                          }}
                          data-testid={`category-pill-${tx.id}`}
                          aria-haspopup="listbox"
                          aria-expanded={editingId === tx.id}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: definition.color }}
                            aria-hidden="true"
                          />
                          <span>{definition.icon}</span>
                          <span>{definition.label}</span>
                          <span className="text-gray-500 dark:text-gray-400">
                            ▾
                          </span>
                        </button>
                        {editingId === tx.id && (
                          <div
                            className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
                            data-testid={`category-menu-${tx.id}`}
                            role="listbox"
                            aria-label="Select category"
                          >
                            {categories.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-medium ${
                                  override === option.id
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/70'
                                }`}
                                onClick={() => {
                                  onCategoryChange(tx.id, option.id)
                                  setEditingId(null)
                                }}
                                data-testid={`category-option-${option.id}-${tx.id}`}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: option.color }}
                                  aria-hidden="true"
                                />
                                <span>{option.icon}</span>
                                <span>{option.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: definition.color }}
                          aria-hidden="true"
                        />
                        <span>{definition.icon}</span>
                        <span>{definition.label}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        tx.type === 'credit'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td className="font-mono px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900 dark:text-gray-100">
                    {tx.amount.toFixed(2)} {tx.currency}
                  </td>
                  <td className="font-mono px-6 py-4 whitespace-nowrap text-right text-gray-900 dark:text-gray-100">
                    {tx.balance !== undefined
                      ? `${tx.balance.toFixed(2)} ${tx.currency}`
                      : '-'}
                  </td>
                </tr>
              )
            })}
            {bottomSpacer > 0 ? (
              <tr style={{ height: bottomSpacer }}>
                <td colSpan={6} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type KnownSortField = Extract<SortField, 'date' | 'description' | 'amount'>
