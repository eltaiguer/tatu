import { useEffect, useMemo, useState } from 'react'
import { isCategoryIgnored } from '../services/categories/category-registry'
import { getCategoryDisplay } from '../utils/category-display'
import { getDisplayDescription } from '../utils/transaction-display'
import type { Transaction, TransactionsFilter } from '../models'

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
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [accountFilters, setAccountFilters] = useState<string[]>([])
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'UYU'>(
    'all'
  )
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit' | 'debit'>(
    'all'
  )
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [showIgnored, setShowIgnored] = useState(false)

  const newestDate = useMemo(() => {
    if (transactions.length === 0) return null
    return new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
  }, [transactions])

  useEffect(() => {
    if (initialFilter) {
      if (initialFilter.category) setCategoryFilters([initialFilter.category])
      if (initialFilter.accountType && initialFilter.accountType !== 'all') {
        setAccountFilters([initialFilter.accountType])
      }
      setCurrencyFilter(initialFilter.currency ?? 'all')
    }
  }, [initialFilter])

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

    const filtered = transactions.filter((transaction) => {
      const searchable =
        `${getDisplayDescription(transaction)} ${transaction.description} ${(transaction.tags ?? []).join(' ')}`.toLowerCase()
      if (!searchable.includes(query)) return false
      if (dateFrom && transaction.date < dateFrom) return false
      if (dateTo && transaction.date > dateTo) return false
      if (
        categoryFilters.length > 0 &&
        !categoryFilters.includes(transaction.category ?? '')
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
      return (
        (a.category ?? '').localeCompare(b.category ?? '', 'es') * direction
      )
    })

    return filtered
  }, [
    transactions,
    searchTerm,
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

  const groupedTransactions = useMemo(() => {
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
      result.push(tx)
      emitted.add(tx.id)
      if (tx.isSplitParent) {
        const children = childrenByParent.get(tx.id) ?? []
        children.forEach((child) => {
          result.push(child)
          emitted.add(child.id)
        })
      }
    })

    return result
  }, [filteredTransactions])

  const totalPages = Math.ceil(groupedTransactions.length / ITEMS_PER_PAGE)
  const safeTotalPages = Math.max(1, totalPages)

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, safeTotalPages))
  }, [safeTotalPages])

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedTransactions = groupedTransactions.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  )
  const paginatedTransactionIds = paginatedTransactions.map((tx) => tx.id)
  const filteredTransactionIds = groupedTransactions.map((tx) => tx.id)

  return {
    searchTerm,
    setSearchTerm,
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
