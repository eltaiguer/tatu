import { useEffect, useMemo, useState } from 'react'
import { isCategoryIgnored } from '../services/categories/category-registry'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import { getCategoryDisplay } from '../utils/category-display'
import { getDisplayDescription } from '../utils/transaction-display'
import type { Transaction } from '../models'
import {
  DEFAULT_URL_FILTERS,
  type UrlFilterState,
} from '../services/filters/url-filters'

export type SortField = 'date' | 'amount' | 'description' | 'category'
export type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE = 12

// `initial` seeds the filters once (from the URL). To apply a different
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
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
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

  const newestDate = useMemo(() => {
    if (transactions.length === 0) return null
    return new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
  }, [transactions])

  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const allFilteredTransactions = useMemo(() => {
    const query = searchTerm.toLowerCase()
    const invalidDateRange =
      dateFromFilter && dateToFilter && dateToFilter < dateFromFilter
    const dateFrom =
      !invalidDateRange && dateFromFilter
        ? new Date(`${dateFromFilter}T00:00:00`)
        : null
    const dateTo =
      !invalidDateRange && dateToFilter
        ? new Date(`${dateToFilter}T23:59:59.999`)
        : null

    // Cheap field comparisons run before the search-string build, and the
    // build is skipped entirely when there is no query. Previously every
    // transaction paid for a template literal + toLowerCase on every
    // keystroke — and on every render with an empty search box, where the
    // resulting `includes('')` was always true anyway.
    // Same normalization Resumen and Categorías count with: missing, '',
    // 'other' and casing all mean "Sin categoría".
    const categorySet = new Set(categoryFilters.map(normalizeCategoryId))

    const filtered = transactions.filter((transaction) => {
      // A split parent stands for its parts and is excluded from every total;
      // it never matches on its own fields (it is shown above matching parts
      // as context instead), so a drill-through adds up to the number clicked.
      if (transaction.isSplitParent) return false
      if (dateFrom && transaction.date < dateFrom) return false
      if (dateTo && transaction.date > dateTo) return false
      if (
        categorySet.size > 0 &&
        !categorySet.has(normalizeCategoryId(transaction.category))
      )
        return false
      if (
        merchantFilter &&
        getDisplayDescription(transaction) !== merchantFilter
      )
        return false
      if (
        accountFilters.length > 0 &&
        !accountFilters.includes(transaction.source)
      )
        return false
      if (currencyFilter !== 'all' && transaction.currency !== currencyFilter)
        return false
      if (typeFilter !== 'all' && transaction.type !== typeFilter) return false
      if (minAmount && Math.abs(transaction.amount) < parseFloat(minAmount))
        return false
      if (maxAmount && Math.abs(transaction.amount) > parseFloat(maxAmount))
        return false

      if (!query) return true

      const searchable =
        `${getDisplayDescription(transaction)} ${transaction.description} ${(transaction.tags ?? []).join(' ')}`.toLowerCase()
      return searchable.includes(query)
    })

    filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'date')
        return (a.date.getTime() - b.date.getTime()) * direction
      if (sortField === 'amount')
        return (Math.abs(a.amount) - Math.abs(b.amount)) * direction
      if (sortField === 'description') {
        return (
          getDisplayDescription(a).localeCompare(
            getDisplayDescription(b),
            'es'
          ) * direction
        )
      }
      return (
        (a.category ?? '').localeCompare(b.category ?? '', 'es') * direction
      )
    })

    return filtered
  }, [
    transactions,
    searchTerm,
    merchantFilter,
    dateFromFilter,
    dateToFilter,
    categoryFilters,
    accountFilters,
    currencyFilter,
    typeFilter,
    minAmount,
    maxAmount,
    sortField,
    sortDirection,
  ])

  const filteredTransactions = useMemo(() => {
    if (showIgnored) return allFilteredTransactions
    return allFilteredTransactions.filter(
      (tx) => !isCategoryIgnored(tx.category)
    )
  }, [allFilteredTransactions, showIgnored])

  const ignoredCount = useMemo(
    () =>
      allFilteredTransactions.filter((tx) => isCategoryIgnored(tx.category))
        .length,
    [allFilteredTransactions]
  )

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .filter((tx) => !tx.isSplitParent)
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
    setDateFromFilter('')
    setDateToFilter('')
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
    paginatedTransactionIds,
    filteredTransactionIds,
    clearAllFilters,
  }
}
