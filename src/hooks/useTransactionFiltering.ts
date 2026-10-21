import { useEffect, useMemo, useState } from 'react'
import {
  countsTowardTotals,
  countsAsRow,
} from '../services/spending/spending-rules'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import { getCategoryDisplay } from '../utils/category-display'
import { todayAsUtcDate } from '../utils/date-utils'
import type { Transaction } from '../models'
import {
  DEFAULT_URL_FILTERS,
  type UrlFilterState,
} from '../services/filters/url-filters'
import {
  filterTransactions,
  groupSplitRows,
  periodDateRange,
  sortTransactions,
  type FilterPatch,
  type FilterState,
  type SortDirection,
  type SortField,
} from '../services/filters/transaction-filter'

export type { FilterPatch, FilterState, SortDirection, SortField }

export const ITEMS_PER_PAGE = 25

const CLEARED_FILTERS: FilterState = {
  ...DEFAULT_URL_FILTERS,
  period: { mode: 'all' },
}

function newestOf(transactions: Transaction[]): Date | null {
  if (transactions.length === 0) return null
  return new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
}

// Filter values are primitives, arrays of primitives (categories, accounts)
// or a period (a flat object of primitives).
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => value === b[i])
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const keys = Object.keys(left)
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => left[key] === right[key])
    )
  }
  return false
}

// `current` with the patch's defined fields applied — or `current` itself
// when that changes nothing, so the value (and the URL written from it) only
// changes when a filter does.
function applyPatch(current: FilterState, patch: FilterPatch): FilterState {
  const changes = Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) =>
        value !== undefined &&
        !sameValue(value, current[key as keyof FilterState])
    )
  ) as FilterPatch
  if (Object.keys(changes).length === 0) return current
  return { ...current, ...changes }
}

// The Transacciones filters as one value in the URL's shape (what
// filterTransactions, #121, decides matches on), plus sort, split grouping
// and pagination. `initial` seeds the filters once (from the URL), period
// included, so a deep-linked month filters the very first render; no period
// means all dates (the view supplies its own default). To apply a different
// initial state, remount the consumer — the view does this on navigations.
// Changing the filters keeps the page unless it no longer exists.
export function useTransactionFiltering({
  transactions,
  initial = DEFAULT_URL_FILTERS,
}: {
  transactions: Transaction[]
  initial?: UrlFilterState
}) {
  const newestDate = useMemo(() => newestOf(transactions), [transactions])

  // The filters, and the month "últimos n meses" counts back from: the
  // newest month with data at the moment it is chosen (or the page is
  // opened); it does not move when rows are imported or deleted afterwards.
  // One state, so choosing that period updates both at once.
  const [{ filters, recentAnchor }, setState] = useState<{
    filters: FilterState
    recentAnchor: Date
  }>(() => ({
    filters: { ...initial, period: initial.period ?? { mode: 'all' } },
    recentAnchor: newestOf(transactions) ?? todayAsUtcDate(),
  }))

  // Applied to the latest state, so several changes in one batch all stick.
  function update(patch: FilterPatch) {
    const anchor =
      patch.period?.mode === 'recent' ? (newestDate ?? todayAsUtcDate()) : null
    setState((current) => {
      const nextFilters = applyPatch(current.filters, patch)
      if (anchor === null && nextFilters === current.filters) return current
      return {
        filters: nextFilters,
        recentAnchor: anchor ?? current.recentAnchor,
      }
    })
  }

  // Every filter back to its default: all dates, ignored rows hidden.
  function clear() {
    update(CLEARED_FILTERS)
  }

  // The period as days, for the date inputs.
  const dateRange = periodDateRange(filters.period, recentAnchor)

  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  // Every matching row, ignored ones included (the totals strip and the
  // "n ignoradas" count need them), sorted for the table.
  const allFilteredTransactions = useMemo(
    () =>
      sortTransactions(
        filterTransactions(
          transactions,
          { ...filters, showIgnored: true },
          { recentAnchor }
        ),
        sortField,
        sortDirection
      ),
    [transactions, filters, recentAnchor, sortField, sortDirection]
  )

  const showIgnored = filters.showIgnored
  const filteredTransactions = useMemo(() => {
    if (showIgnored) return allFilteredTransactions
    // Split parents are already out, so the rows that don't count are the
    // ignored ones; "show ignored" reveals them.
    return allFilteredTransactions.filter(countsTowardTotals)
  }, [allFilteredTransactions, showIgnored])

  const ignoredCount = useMemo(
    () =>
      allFilteredTransactions.filter((tx) => !countsTowardTotals(tx)).length,
    [allFilteredTransactions]
  )

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .filter(countsAsRow)
            .map((tx) => normalizeCategoryId(tx.category))
        )
      ).sort((a, b) =>
        getCategoryDisplay(a).label.localeCompare(
          getCategoryDisplay(b).label,
          'es'
        )
      ),
    [transactions]
  )

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  const groupedTransactions = useMemo(
    () => groupSplitRows(filteredTransactions, transactions),
    [filteredTransactions, transactions]
  )

  const totalPages = Math.ceil(groupedTransactions.length / ITEMS_PER_PAGE)
  const safeTotalPages = Math.max(1, totalPages)

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, safeTotalPages))
  }, [safeTotalPages])

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE

  // These three are handed to memoized children, so a fresh array identity on
  // every render defeats that memoization entirely — identity is behavior
  // here, not a micro-optimization. filteredTransactionIds in particular
  // re-mapped the whole filtered set, not just the visible page.
  const paginatedTransactions = useMemo(
    () => groupedTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE),
    [groupedTransactions, startIndex]
  )
  const paginatedTransactionIds = useMemo(
    () => paginatedTransactions.map((tx) => tx.id),
    [paginatedTransactions]
  )
  const filteredTransactionIds = useMemo(
    () => groupedTransactions.map((tx) => tx.id),
    [groupedTransactions]
  )

  return {
    filters,
    update,
    clear,
    dateRange,
    sortField,
    sortDirection,
    handleSort,
    allFilteredTransactions,
    filteredTransactions,
    ignoredCount,
    availableCategories,
    newestDate,
    currentPage,
    setCurrentPage,
    totalPages,
    safeTotalPages,
    startIndex,
    paginatedTransactions,
    // Rows on screen across all pages: matching rows plus the split parents
    // shown above their parts as context. Paging counts these.
    displayedRowCount: groupedTransactions.length,
    paginatedTransactionIds,
    filteredTransactionIds,
  }
}
