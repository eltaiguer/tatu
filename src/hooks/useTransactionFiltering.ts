import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  countsTowardTotals,
  countsAsRow,
} from '../services/spending/spending-rules'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import { sortCategoryIdsByLabel } from '../services/categories/category-registry'
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
  periodWithDateBound,
  sortTransactions,
  type FilterPatch,
  type FilterState,
  type SortDirection,
  type SortField,
} from '../services/filters/transaction-filter'

export type { FilterPatch, FilterState, SortDirection, SortField }

export const ITEMS_PER_PAGE = 25

// Fresh lists every time: the state never shares DEFAULT_URL_FILTERS' arrays.
function clearedFilters(): FilterState {
  return {
    ...DEFAULT_URL_FILTERS,
    categories: [],
    accounts: [],
    period: { mode: 'all' },
  }
}

function newestOf(transactions: Transaction[]): Date | null {
  if (transactions.length === 0) return null
  return new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
}

// Structural equality over filter values: primitives, lists and the period
// (a plain object), however the state grows.
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((value, i) => sameValue(value, b[i]))
    )
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const keys = Object.keys(left)
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => key in right && sameValue(left[key], right[key]))
    )
  }
  return false
}

// `current` with the patch's defined fields applied — or `current` itself
// when no field changes, so the value (and the URL written from it) only
// changes when a filter does.
function applyPatch(current: FilterState, patch: FilterPatch): FilterState {
  const changes = Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) =>
        value !== undefined &&
        !sameValue(value, current[key as keyof FilterState])
    )
  ) as FilterPatch
  return Object.keys(changes).length === 0
    ? current
    : { ...current, ...changes }
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
  // The newest row as of the last commit, for the stable updaters below
  // (read when they are called, never written during render).
  const newestRef = useRef(newestDate)
  useLayoutEffect(() => {
    newestRef.current = newestDate
  }, [newestDate])

  // The filters, and the month "últimos n meses" counts back from: the
  // newest month with data at the moment it is chosen (or the page is
  // opened); it does not move when rows are imported or deleted afterwards.
  // One state, so choosing that period updates both at once.
  const [{ filters, recentAnchor }, setState] = useState<{
    filters: FilterState
    recentAnchor: Date
  }>(() => ({
    filters: {
      ...initial,
      categories: [...initial.categories],
      accounts: [...initial.accounts],
      period: initial.period ?? { mode: 'all' },
    },
    recentAnchor: newestOf(transactions) ?? todayAsUtcDate(),
  }))

  // Applied to the latest state, so several changes in one batch all stick.
  // Choosing "últimos n meses" (again) anchors it to the newest row now.
  const update = useCallback((patch: FilterPatch) => {
    // Taken when the change is made, from committed rows.
    const chosenAnchor =
      patch.period?.mode === 'recent'
        ? (newestRef.current ?? todayAsUtcDate())
        : null
    setState((current) => {
      const nextFilters = applyPatch(current.filters, patch)
      const anchor = chosenAnchor ?? current.recentAnchor
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
  const clear = useCallback(() => update(clearedFilters()), [update])

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
      sortCategoryIdsByLabel(
        Array.from(
          new Set(
            transactions
              .filter(countsAsRow)
              .map((tx) => normalizeCategoryId(tx.category))
          )
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
