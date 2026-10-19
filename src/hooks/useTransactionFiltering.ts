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
  type UrlPeriod,
} from '../services/filters/url-filters'
import {
  filterTransactions,
  periodDateRange,
  sortTransactions,
  type SortDirection,
  type SortField,
} from '../services/filters/transaction-filter'

export type { SortDirection, SortField }

export const ITEMS_PER_PAGE = 25

function newestOf(transactions: Transaction[]): Date | null {
  if (transactions.length === 0) return null
  return new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
}

// React state + pagination around filterTransactions (#121), which owns what
// "matches" means. `initial` seeds the filters once (from the URL), period
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
  const [searchTerm, setSearchTerm] = useState(initial.search)
  const [merchantFilter, setMerchantFilter] = useState(initial.merchant)
  const [period, setPeriodState] = useState<UrlPeriod>(
    initial.period ?? { mode: 'all' }
  )
  const [categoryFilters, setCategoryFilters] = useState<string[]>(
    initial.categories
  )
  const [accountFilters, setAccountFilters] = useState<string[]>(
    initial.accounts
  )
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'UYU'>(
    initial.currency
  )
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>(
    initial.type
  )
  const [minAmount, setMinAmount] = useState(initial.min)
  const [maxAmount, setMaxAmount] = useState(initial.max)
  const [showIgnored, setShowIgnored] = useState(initial.showIgnored)

  const newestDate = useMemo(() => newestOf(transactions), [transactions])

  // "Últimos n meses" counts back from the newest month with data at the
  // moment it is chosen (or the page is opened); it does not move when rows
  // are imported or deleted afterwards.
  const [recentAnchor, setRecentAnchor] = useState<Date>(
    () => newestOf(transactions) ?? todayAsUtcDate()
  )

  function setPeriod(next: UrlPeriod) {
    if (next.mode === 'recent') {
      setRecentAnchor(newestDate ?? todayAsUtcDate())
    }
    setPeriodState(next)
  }

  // The period as days, for the date inputs. Editing one makes the period a
  // custom range (kept in the URL as desde/hasta).
  const { from: dateFromFilter, to: dateToFilter } = periodDateRange(
    period,
    recentAnchor
  )
  // Updater form, so setting both ends in one batch keeps both.
  function setDateBound(bound: 'from' | 'to', value: string) {
    setPeriodState((current) => {
      const range = {
        ...periodDateRange(current, recentAnchor),
        [bound]: value,
      }
      return range.from || range.to
        ? { mode: 'range', from: range.from, to: range.to }
        : { mode: 'all' }
    })
  }
  function setDateFromFilter(value: string) {
    setDateBound('from', value)
  }
  function setDateToFilter(value: string) {
    setDateBound('to', value)
  }

  // The filter state in the URL's shape: what filterTransactions reads and
  // what the view serializes.
  const filters = useMemo<UrlFilterState>(
    () => ({
      search: searchTerm,
      merchant: merchantFilter,
      categories: categoryFilters,
      // Passed through unchanged: the filter bar only offers these two, and
      // dropping an unknown value would widen the match to every account.
      accounts: accountFilters as UrlFilterState['accounts'],
      currency: currencyFilter,
      type: typeFilter,
      min: minAmount,
      max: maxAmount,
      showIgnored,
      period,
    }),
    [
      searchTerm,
      merchantFilter,
      categoryFilters,
      accountFilters,
      currencyFilter,
      typeFilter,
      minAmount,
      maxAmount,
      showIgnored,
      period,
    ]
  )

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

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(merchantFilter) ||
    categoryFilters.length > 0 ||
    accountFilters.length > 0 ||
    currencyFilter !== 'all' ||
    typeFilter !== 'all' ||
    Boolean(minAmount) ||
    Boolean(maxAmount)

  const activeCurrencies = useMemo(
    () =>
      (['UYU', 'USD'] as const).filter((c) =>
        transactions.some((tx) => tx.currency === c)
      ),
    [transactions]
  )

  function clearAllFilters() {
    setSearchTerm('')
    setMerchantFilter('')
    setPeriodState({ mode: 'all' })
    setCategoryFilters([])
    setAccountFilters([])
    setCurrencyFilter('all')
    setTypeFilter('all')
    setMinAmount('')
    setMaxAmount('')
    setShowIgnored(false)
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  // Matching split parts are shown under their parent (as context, not as a
  // counted row); other rows keep their order.
  const groupedTransactions = useMemo(() => {
    const byId = new Map(transactions.map((tx) => [tx.id, tx]))
    const childrenByParent = new Map<string, Transaction[]>()
    filteredTransactions.forEach((tx) => {
      if (tx.splitParentId) {
        const arr = childrenByParent.get(tx.splitParentId) ?? []
        arr.push(tx)
        childrenByParent.set(tx.splitParentId, arr)
      }
    })

    const result: Transaction[] = []
    const emitted = new Set<string>()

    filteredTransactions.forEach((tx) => {
      if (emitted.has(tx.id)) return
      const parent = tx.splitParentId ? byId.get(tx.splitParentId) : undefined
      if (parent && !emitted.has(parent.id)) {
        result.push(parent)
        emitted.add(parent.id)
        ;(childrenByParent.get(parent.id) ?? []).forEach((child) => {
          result.push(child)
          emitted.add(child.id)
        })
        return
      }
      result.push(tx)
      emitted.add(tx.id)
    })

    return result
  }, [filteredTransactions, transactions])

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
    searchTerm,
    setSearchTerm,
    merchantFilter,
    setMerchantFilter,
    period,
    setPeriod,
    filters,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter,
    categoryFilters,
    setCategoryFilters,
    accountFilters,
    setAccountFilters,
    currencyFilter,
    setCurrencyFilter,
    typeFilter,
    setTypeFilter,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
    showIgnored,
    setShowIgnored,
    sortField,
    sortDirection,
    handleSort,
    allFilteredTransactions,
    filteredTransactions,
    ignoredCount,
    availableCategories,
    hasActiveFilters,
    newestDate,
    activeCurrencies,
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
    clearAllFilters,
  }
}
