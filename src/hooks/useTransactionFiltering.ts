import { useEffect, useMemo, useState } from 'react'
import { calculateTotals } from '../services/aggregator/aggregation'
import { getCategoryDisplay } from '../utils/category-display'
import { getDisplayDescription } from '../utils/transaction-display'
import type { Transaction, TransactionsFilter } from '../models'

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthBounds(): { start: string; end: string } {
  const now = new Date()
  return {
    start: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

export type SortField = 'date' | 'amount' | 'description' | 'category'
export type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE = 12

export function useTransactionFiltering({
  transactions,
  initialFilter,
}: {
  transactions: Transaction[]
  initialFilter?: TransactionsFilter
}) {
  const defaultBounds = useMemo(() => currentMonthBounds(), [])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState(
    () => currentMonthBounds().start
  )
  const [dateToFilter, setDateToFilter] = useState(
    () => currentMonthBounds().end
  )
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState<
    'all' | 'credit_card' | 'bank_account'
  >('all')
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'UYU'>(
    'all'
  )
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>(
    'all'
  )

  useEffect(() => {
    if (initialFilter) {
      setCategoryFilter(initialFilter.category ?? '')
      setAccountFilter(initialFilter.accountType ?? 'all')
      setCurrencyFilter(initialFilter.currency ?? 'all')
    }
  }, [initialFilter])

  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredTransactions = useMemo(() => {
    const query = searchTerm.toLowerCase()
    const categoryQuery = categoryFilter.trim()
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

    const filtered = transactions.filter((transaction) => {
      const searchable =
        `${getDisplayDescription(transaction)} ${transaction.description} ${(transaction.tags ?? []).join(' ')}`.toLowerCase()
      if (!searchable.includes(query)) return false
      if (dateFrom && transaction.date < dateFrom) return false
      if (dateTo && transaction.date > dateTo) return false
      if (categoryQuery && (transaction.category ?? '') !== categoryQuery)
        return false
      if (accountFilter !== 'all' && transaction.source !== accountFilter)
        return false
      if (currencyFilter !== 'all' && transaction.currency !== currencyFilter)
        return false
      if (typeFilter !== 'all' && transaction.type !== typeFilter) return false
      return true
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
      return (a.category ?? '').localeCompare(b.category ?? '', 'es') * direction
    })

    return filtered
  }, [
    transactions,
    searchTerm,
    dateFromFilter,
    dateToFilter,
    categoryFilter,
    accountFilter,
    currencyFilter,
    typeFilter,
    sortField,
    sortDirection,
  ])

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(
          transactions
            .map((tx) => tx.category?.trim() ?? '')
            .filter(Boolean)
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
    dateFromFilter !== defaultBounds.start ||
    dateToFilter !== defaultBounds.end ||
    Boolean(categoryFilter) ||
    accountFilter !== 'all' ||
    currencyFilter !== 'all' ||
    typeFilter !== 'all'

  const totals = calculateTotals(filteredTransactions)

  const activeCurrencies = useMemo(
    () =>
      (['UYU', 'USD'] as const).filter((c) =>
        transactions.some((tx) => tx.currency === c)
      ),
    [transactions]
  )

  function clearAllFilters() {
    setSearchTerm('')
    setDateFromFilter(defaultBounds.start)
    setDateToFilter(defaultBounds.end)
    setCategoryFilter('')
    setAccountFilter('all')
    setCurrencyFilter('all')
    setTypeFilter('all')
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)
  const safeTotalPages = Math.max(1, totalPages)

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, safeTotalPages))
  }, [safeTotalPages])

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedTransactions = filteredTransactions.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  )
  const paginatedTransactionIds = paginatedTransactions.map((tx) => tx.id)
  const filteredTransactionIds = filteredTransactions.map((tx) => tx.id)

  return {
    searchTerm,
    setSearchTerm,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter,
    categoryFilter,
    setCategoryFilter,
    accountFilter,
    setAccountFilter,
    currencyFilter,
    setCurrencyFilter,
    typeFilter,
    setTypeFilter,
    sortField,
    sortDirection,
    handleSort,
    filteredTransactions,
    availableCategories,
    hasActiveFilters,
    totals,
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
