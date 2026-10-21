import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  serializeFilterParams,
  type UrlFilterState,
} from '../services/filters/url-filters'
import {
  filterTransactions,
  groupSplitRows,
  periodDateRange,
  periodWithDateBound,
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

// `current` with the patch's defined fields applied — or `current` itself
// when that changes nothing, so the value (and the URL written from it) only
// changes when a filter does. Compared in the URL's own representation: every
// filter lives in the URL, so a new field is compared without touching this.
function applyPatch(current: FilterState, patch: FilterPatch): FilterState {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as FilterPatch
  const next = { ...current, ...defined }
  return serializeFilterParams(next) === serializeFilterParams(current)
    ? current
    : next
}

// The Transacciones filters as one value in the URL's shape (what
// filterTransactions, #121, decides matches on), plus sort, split grouping
// and pagination. `initial` seeds the filters once (from the URL), period
// included, so a deep-linked month filters the very first render; no period
// means all dates (the view supplies its own default). To apply a different
// initial state, remount the consumer — the view does this on navigations.
export function useTransactionFiltering({
  transactions,
  initial = DEFAULT_URL_FILTERS,
}: {
  transactions: Transaction[]
  initial?: UrlFilterState
}) {
  const newestDate = useMemo(() => newestOf(transactions), [transactions])
  // Read by the stable updaters below: the newest row as of this render.
  const newestRef = useRef(newestDate)
  newestRef.current = newestDate

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
  // Choosing "últimos n meses" (again) anchors it to the newest row now.
  const update = useCallback((patch: FilterPatch) => {
    setState((current) => {
      const nextFilters = applyPatch(current.filters, patch)
      const anchor =
        patch.period?.mode === 'recent'
          ? (newestRef.current ?? todayAsUtcDate())
          : current.recentAnchor
      if (
        nextFilters === current.filters &&
        anchor.getTime() === current.recentAnchor.getTime()
      ) {
        return current
      }
      return { filters: nextFilters, recentAnchor: anchor }
    })
  }, [])

  // Editing one end of the date inputs: a custom range that keeps the other
  // end of the period as it is now (not as last rendered).
  const setDateBound = useCallback((bound: 'from' | 'to', value: string) => {
    setState((current) => {
      const range = periodDateRange(
        current.filters.period,
        current.recentAnchor
      )
      const nextFilters = applyPatch(current.filters, {
        period: periodWithDateBound(range, bound, value),
      })
      return nextFilters === current.filters
        ? current
        : { ...current, filters: nextFilters }
    })
  }, [])

  // Every filter back to its default: all dates, ignored rows hidden.
  const clear = useCallback(() => update(CLEARED_FILTERS), [update])

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
    setDateBound,
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
