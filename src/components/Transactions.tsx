import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  CreditCard,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { CategoryBadge } from './CategoryBadge'
import { ConfidenceBadge } from './ConfidenceBadge'
import { Category } from '../models'
import type { Currency, Transaction } from '../models'
import { getDescriptionOverride } from '../services/descriptions/description-overrides'
import { getCategoryDisplay } from '../utils/category-display'

interface TransactionsProps {
  transactions: Transaction[]
  onUpdateTransaction?: (
    transactionId: string,
    updates: {
      displayDescription?: string
      category?: string
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ) => Promise<void> | void
  onDeleteTransaction?: (transactionId: string) => Promise<void> | void
  onAutoCategorizeTransactions?: (transactionIds: string[]) => Promise<void> | void
  onBulkCategorize?: (transactionIds: string[], category: string) => Promise<void> | void
  onBulkDelete?: (transactionIds: string[]) => Promise<void> | void
  onBulkTag?: (transactionIds: string[], tag: string) => Promise<void> | void
}

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDirection = 'asc' | 'desc'

function getDisplayDescription(transaction: Transaction): string {
  if (transaction.displayDescription?.trim()) {
    return transaction.displayDescription.trim()
  }

  const override = getDescriptionOverride(transaction.description)
  if (override?.friendlyDescription?.trim()) {
    return override.friendlyDescription.trim()
  }

  return transaction.description
}

function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(amount)
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount)

  const symbol = currency === 'UYU' ? '$U' : 'US$'
  return `${symbol} ${formatted}`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function Transactions({
  transactions,
  onUpdateTransaction,
  onDeleteTransaction,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkDelete,
  onBulkTag,
}: TransactionsProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accountFilter, setAccountFilter] = useState<'all' | 'credit_card' | 'bank_account'>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(
    null
  )
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([])
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false)
  const [isBulkOperating, setIsBulkOperating] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkEditCategory, setBulkEditCategory] = useState('')
  const [bulkEditTagList, setBulkEditTagList] = useState<string[]>([])
  const [bulkCategoryPickerOpen, setBulkCategoryPickerOpen] = useState(false)
  const [bulkCategorySearch, setBulkCategorySearch] = useState('')
  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false)
  const [bulkTagSearch, setBulkTagSearch] = useState('')

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTagList, setEditTagList] = useState<string[]>([])
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [newTagInput, setNewTagInput] = useState('')
  const [applyScope, setApplyScope] = useState<
    'single' | 'matching_past_and_future' | 'future_matching_only'
  >('single')
  const [editError, setEditError] = useState('')

  const itemsPerPage = 20

  const filteredTransactions = useMemo(() => {
    const query = searchTerm.toLowerCase()
    const categoryQuery = categoryFilter.trim()
    const dateFrom = dateFromFilter ? new Date(`${dateFromFilter}T00:00:00`) : null
    const dateTo = dateToFilter ? new Date(`${dateToFilter}T23:59:59.999`) : null

    const filtered = transactions.filter((transaction) => {
      const searchable =
        `${getDisplayDescription(transaction)} ${transaction.description} ${(transaction.tags ?? []).join(' ')}`.toLowerCase()
      if (!searchable.includes(query)) {
        return false
      }

      if (dateFrom && transaction.date < dateFrom) {
        return false
      }

      if (dateTo && transaction.date > dateTo) {
        return false
      }

      if (categoryQuery && (transaction.category ?? '') !== categoryQuery) {
        return false
      }

      if (accountFilter !== 'all' && transaction.source !== accountFilter) {
        return false
      }

      return true
    })

    filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1

      if (sortField === 'date') {
        return (a.date.getTime() - b.date.getTime()) * direction
      }
      if (sortField === 'amount') {
        return (Math.abs(a.amount) - Math.abs(b.amount)) * direction
      }
      if (sortField === 'description') {
        return (
          getDisplayDescription(a).localeCompare(getDisplayDescription(b), 'es') *
          direction
        )
      }

      const aCategory = a.category ?? ''
      const bCategory = b.category ?? ''
      return aCategory.localeCompare(bCategory, 'es') * direction
    })

    return filtered
  }, [
    transactions,
    searchTerm,
    dateFromFilter,
    dateToFilter,
    categoryFilter,
    accountFilter,
    sortField,
    sortDirection,
  ])

  const availableCategories = useMemo(() => {
    return Array.from(
      new Set(
        transactions
          .map((transaction) => transaction.category?.trim() ?? '')
          .filter(Boolean)
      )
    ).sort((a, b) =>
      getCategoryDisplay(a).label.localeCompare(getCategoryDisplay(b).label, 'es')
    )
  }, [transactions])

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(dateFromFilter) ||
    Boolean(dateToFilter) ||
    Boolean(categoryFilter) ||
    accountFilter !== 'all'

  const categorySuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...Object.values(Category),
          ...transactions.map((tx) => tx.category ?? ''),
          editCategory,
        ]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) =>
      getCategoryDisplay(a).label.localeCompare(getCategoryDisplay(b).label, 'es')
    )
  }, [transactions, editCategory])

  const filteredCategorySuggestions = useMemo(() => {
    const query = newCategoryInput.trim().toLowerCase()
    if (!query) {
      return categorySuggestions
    }

    return categorySuggestions.filter((category) => {
      const label = getCategoryDisplay(category).label.toLowerCase()
      return category.toLowerCase().includes(query) || label.includes(query)
    })
  }, [categorySuggestions, newCategoryInput])

  const tagSuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [...transactions.flatMap((tx) => tx.tags ?? []), ...editTagList]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'))
  }, [transactions, editTagList])

  const filteredTagSuggestions = useMemo(() => {
    const query = newTagInput.trim().toLowerCase()
    if (!query) {
      return tagSuggestions
    }

    return tagSuggestions.filter((tag) =>
      tag.toLowerCase().includes(query)
    )
  }, [tagSuggestions, newTagInput])

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
  const safeTotalPages = Math.max(1, totalPages)

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, safeTotalPages))
  }, [safeTotalPages])

  useEffect(() => {
    const validIds = new Set(transactions.map((transaction) => transaction.id))
    setSelectedTransactionIds((current) =>
      current.filter((transactionId) => validIds.has(transactionId))
    )
  }, [transactions])

  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedTransactions = filteredTransactions.slice(
    startIndex,
    startIndex + itemsPerPage
  )
  const paginatedTransactionIds = paginatedTransactions.map(
    (transaction) => transaction.id
  )
  const filteredTransactionIds = filteredTransactions.map(
    (transaction) => transaction.id
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  const getAccountIcon = (type: string) => {
    if (type === 'credit_card') return <CreditCard size={14} />
    return <Wallet size={14} />
  }

  const getAccountLabel = (type: string) => {
    if (type === 'credit_card') return 'Tarjeta'
    return 'Cuenta'
  }

  function startEditTransaction(transaction: Transaction) {
    setEditingTransaction(transaction)
    setEditDescription(getDisplayDescription(transaction))
    setEditCategory(transaction.category ?? '')
    setEditTagList(transaction.tags ?? [])
    setApplyScope('single')
    setCategoryPickerOpen(false)
    setTagPickerOpen(false)
    setNewCategoryInput('')
    setNewTagInput('')
    setEditError('')
  }

  function resetEditState() {
    setEditingTransaction(null)
    setEditDescription('')
    setEditCategory('')
    setEditTagList([])
    setApplyScope('single')
    setCategoryPickerOpen(false)
    setTagPickerOpen(false)
    setNewCategoryInput('')
    setNewTagInput('')
    setEditError('')
  }

  function handleAddCategory() {
    const value = newCategoryInput.trim()
    if (!value) return
    setEditCategory(value)
    setNewCategoryInput('')
  }

  function handleAddTag(tag: string) {
    const value = tag.trim()
    if (!value || editTagList.includes(value)) return
    setEditTagList((current) => [...current, value])
  }

  function handleAddInlineTag() {
    handleAddTag(newTagInput)
    setNewTagInput('')
  }

  function handleRemoveTag(tag: string) {
    setEditTagList((current) => current.filter((value) => value !== tag))
  }

  async function handleSaveEditTransaction() {
    if (!onUpdateTransaction || !editingTransaction) return

    const trimmedDescription = editDescription.trim()
    if (!trimmedDescription) {
      setEditError('La descripción no puede quedar vacía')
      return
    }

    setPendingTransactionId(editingTransaction.id)
    try {
      await onUpdateTransaction(editingTransaction.id, {
        displayDescription: trimmedDescription,
        category: editCategory.trim() || undefined,
        tags: editTagList,
        applyScope,
      })
      resetEditState()
    } finally {
      setPendingTransactionId(null)
    }
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    if (!onDeleteTransaction) return

    const confirmed = window.confirm(
      `¿Eliminar la transacción "${getDisplayDescription(transaction)}"?`
    )
    if (!confirmed) return

    setPendingTransactionId(transaction.id)
    try {
      await onDeleteTransaction(transaction.id)
    } finally {
      setPendingTransactionId(null)
    }
  }

  function toggleTransactionSelection(transactionId: string, checked: boolean) {
    setSelectedTransactionIds((current) => {
      if (checked) {
        return current.includes(transactionId)
          ? current
          : [...current, transactionId]
      }

      return current.filter((id) => id !== transactionId)
    })
  }

  function mergeSelectedTransactionIds(transactionIds: string[]) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)
      transactionIds.forEach((transactionId) => next.add(transactionId))
      return Array.from(next)
    })
  }

  function handleSelectCurrentPage() {
    mergeSelectedTransactionIds(paginatedTransactionIds)
  }

  function handleSelectAllFiltered() {
    mergeSelectedTransactionIds(filteredTransactionIds)
  }

  function handleClearSelection() {
    setSelectedTransactionIds([])
  }

  const bulkFilteredCategories = useMemo(() => {
    const query = bulkCategorySearch.trim().toLowerCase()
    if (!query) return categorySuggestions
    return categorySuggestions.filter((category) => {
      const label = getCategoryDisplay(category).label.toLowerCase()
      return category.toLowerCase().includes(query) || label.includes(query)
    })
  }, [categorySuggestions, bulkCategorySearch])

  const bulkFilteredTags = useMemo(() => {
    const query = bulkTagSearch.trim().toLowerCase()
    if (!query) return tagSuggestions
    return tagSuggestions.filter((tag) => tag.toLowerCase().includes(query))
  }, [tagSuggestions, bulkTagSearch])

  const isBusy = isAutoCategorizing || isBulkOperating

  async function handleAutoCategorizeSelected() {
    if (
      !onAutoCategorizeTransactions ||
      selectedTransactionIds.length === 0 ||
      isAutoCategorizing
    ) {
      return
    }

    setIsAutoCategorizing(true)
    try {
      await onAutoCategorizeTransactions(selectedTransactionIds)
      setSelectedTransactionIds([])
    } finally {
      setIsAutoCategorizing(false)
    }
  }


  async function handleBulkDelete() {
    if (!onBulkDelete || selectedTransactionIds.length === 0 || isBulkOperating) {
      return
    }

    const confirmed = window.confirm(
      `¿Eliminar ${selectedTransactionIds.length} transacción${selectedTransactionIds.length === 1 ? '' : 'es'}?`
    )
    if (!confirmed) return

    setIsBulkOperating(true)
    try {
      await onBulkDelete(selectedTransactionIds)
      setSelectedTransactionIds([])
    } finally {
      setIsBulkOperating(false)
    }
  }


  function openBulkEdit() {
    setBulkEditCategory('')
    setBulkEditTagList([])
    setBulkCategorySearch('')
    setBulkTagSearch('')
    setBulkEditOpen(true)
  }

  function closeBulkEdit() {
    setBulkEditOpen(false)
    setBulkCategoryPickerOpen(false)
    setBulkTagPickerOpen(false)
    setBulkCategorySearch('')
    setBulkTagSearch('')
  }

  async function handleBulkEditSave() {
    if (selectedTransactionIds.length === 0 || isBulkOperating) return

    setIsBulkOperating(true)
    try {
      if (bulkEditCategory && onBulkCategorize) {
        await onBulkCategorize(selectedTransactionIds, bulkEditCategory)
      }
      for (const tag of bulkEditTagList) {
        if (onBulkTag) {
          await onBulkTag(selectedTransactionIds, tag)
        }
      }
      setSelectedTransactionIds([])
      closeBulkEdit()
    } finally {
      setIsBulkOperating(false)
    }
  }

  const selectionCount = selectedTransactionIds.length
  const hasSelection = selectionCount > 0

  const allPageSelected =
    paginatedTransactionIds.length > 0 &&
    paginatedTransactionIds.every((id) => selectedTransactionIds.includes(id))
  const somePageSelected =
    !allPageSelected &&
    paginatedTransactionIds.some((id) => selectedTransactionIds.includes(id))

  function handleHeaderCheckboxChange(checked: boolean) {
    if (checked) {
      handleSelectCurrentPage()
    } else {
      handleClearSelection()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1">Transacciones</h2>
        <p className="text-muted-foreground">
          {filteredTransactions.length} transacciones encontradas
        </p>
      </div>

      <Card className="p-4">
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={20}
            />
            <Input
              placeholder="Buscar por comercio o descripción..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <label
                htmlFor="transactions-date-from-filter"
                className="text-sm font-medium"
              >
                Fecha desde
              </label>
              <Input
                id="transactions-date-from-filter"
                aria-label="Filtro fecha desde"
                type="date"
                value={dateFromFilter}
                onChange={(event) => setDateFromFilter(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="transactions-date-to-filter"
                className="text-sm font-medium"
              >
                Fecha hasta
              </label>
              <Input
                id="transactions-date-to-filter"
                aria-label="Filtro fecha hasta"
                type="date"
                value={dateToFilter}
                onChange={(event) => setDateToFilter(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="transactions-category-filter"
                className="text-sm font-medium"
              >
                Categoría
              </label>
              <select
                id="transactions-category-filter"
                aria-label="Filtro categoría"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="border-input bg-input-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="">Todas</option>
                {availableCategories.map((category) => (
                <option key={category} value={category}>
                    {getCategoryDisplay(category).label}
                </option>
              ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="transactions-account-filter"
                className="text-sm font-medium"
              >
                Cuenta
              </label>
              <select
                id="transactions-account-filter"
                aria-label="Filtro cuenta"
                value={accountFilter}
                onChange={(event) =>
                  setAccountFilter(
                    event.target.value as 'all' | 'credit_card' | 'bank_account'
                  )
                }
                className="border-input bg-input-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
              >
                <option value="all">Todas</option>
                <option value="bank_account">Cuenta bancaria</option>
                <option value="credit_card">Tarjeta</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {hasSelection && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" role="status">
            {selectionCount} seleccionada{selectionCount === 1 ? '' : 's'}
          </span>

          {allPageSelected && selectionCount < filteredTransactions.length && (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              disabled={isBusy}
              onClick={handleSelectAllFiltered}
            >
              Seleccionar las {filteredTransactions.length} transacciones
            </button>
          )}

          <span className="hidden md:inline text-border">|</span>

          {(onBulkCategorize || onBulkTag) && (
            <Button variant="outline" size="sm" disabled={isBusy} onClick={openBulkEdit}>
              <Pencil size={14} className="mr-1.5" />
              Editar
            </Button>
          )}

          {onAutoCategorizeTransactions && (
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                void handleAutoCategorizeSelected()
              }}
            >
              <Sparkles size={14} className="mr-1.5" />
              {isAutoCategorizing ? 'Auto-categorizando...' : 'Auto-categorizar'}
            </Button>
          )}

          {onBulkDelete && (
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              className="text-destructive hover:text-destructive"
              onClick={() => {
                void handleBulkDelete()
              }}
            >
              <Trash2 size={14} className="mr-1.5" />
              Eliminar
            </Button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="p-4 w-12">
                  <Checkbox
                    aria-label="Seleccionar todas"
                    checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                    onCheckedChange={(checked) =>
                      handleHeaderCheckboxChange(checked === true)
                    }
                    disabled={paginatedTransactionIds.length === 0 || isBusy}
                  />
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Fecha
                    {sortField === 'date' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('description')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Descripción
                    {sortField === 'description' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Categoría
                    {sortField === 'category' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">Cuenta</th>
                <th className="text-right p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('amount')}
                    className="flex items-center gap-2 ml-auto hover:text-primary transition-colors"
                  >
                    Monto
                    {sortField === 'amount' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-center p-4 text-sm font-medium w-20">Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {hasActiveFilters
                      ? 'No hay transacciones que coincidan con los filtros'
                      : 'No hay transacciones para mostrar'}
                  </td>
                </tr>
              )}
              {paginatedTransactions.map((transaction) => (
                (() => {
                  const displayDescription = getDisplayDescription(transaction)
                  const hasFriendlyOverride = displayDescription !== transaction.description

                  return (
                <tr
                  key={transaction.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="p-4 align-top">
                    <Checkbox
                      aria-label={`Seleccionar ${displayDescription}`}
                      checked={selectedTransactionIds.includes(transaction.id)}
                      onCheckedChange={(checked) =>
                        toggleTransactionSelection(transaction.id, checked === true)
                      }
                      disabled={isBusy}
                    />
                  </td>
                  <td className="p-4">
                    <div className="text-sm">{formatDate(transaction.date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.date.toLocaleTimeString('es-UY', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{displayDescription}</div>
                    {hasFriendlyOverride && (
                      <div className="text-xs text-muted-foreground">
                        Original: {transaction.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {transaction.type === 'debit' ? 'Débito' : 'Crédito'}
                    </div>
                    {(transaction.tags ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(transaction.tags ?? []).map((tag) => (
                          <span
                            key={`${transaction.id}-${tag}`}
                            className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <CategoryBadge
                        categoryId={transaction.category || Category.Uncategorized}
                        size="sm"
                      />
                      <ConfidenceBadge
                        confidence={transaction.categoryConfidence || 0}
                      />
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {getAccountIcon(transaction.source)}
                      <span>{getAccountLabel(transaction.source)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div
                      className={`font-mono ${
                        transaction.type === 'credit'
                          ? 'text-success-600'
                          : 'text-foreground'
                      }`}
                    >
                      {transaction.type === 'credit' ? '+' : '-'}
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${displayDescription}`}
                        disabled={pendingTransactionId === transaction.id}
                        onClick={() => startEditTransaction(transaction)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Eliminar ${displayDescription}`}
                        disabled={pendingTransactionId === transaction.id}
                        onClick={() => {
                          void handleDeleteTransaction(transaction)
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
                  )
                })()
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-border">
          {paginatedTransactions.length > 0 && (
            <div className="p-4 flex items-center gap-3 bg-muted/30">
              <Checkbox
                aria-label="Seleccionar todas"
                checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) =>
                  handleHeaderCheckboxChange(checked === true)
                }
                disabled={isBusy}
              />
              <span className="text-sm text-muted-foreground">Seleccionar todas</span>
            </div>
          )}
          {paginatedTransactions.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'No hay transacciones que coincidan con los filtros'
                : 'No hay transacciones para mostrar'}
            </div>
          )}
          {paginatedTransactions.map((transaction) => (
            (() => {
              const displayDescription = getDisplayDescription(transaction)
              const hasFriendlyOverride = displayDescription !== transaction.description

              return (
            <div key={transaction.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <Checkbox
                  aria-label={`Seleccionar ${displayDescription}`}
                  checked={selectedTransactionIds.includes(transaction.id)}
                  onCheckedChange={(checked) =>
                    toggleTransactionSelection(transaction.id, checked === true)
                  }
                  disabled={isBusy}
                />
                <div className="flex-1">
                  <div className="font-medium mb-1">{displayDescription}</div>
                  {hasFriendlyOverride && (
                    <div className="text-xs text-muted-foreground mb-1">
                      Original: {transaction.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mb-2">
                    {formatDate(transaction.date)}
                  </div>
                </div>
                <div
                  className={`font-mono ${
                    transaction.type === 'credit'
                      ? 'text-success-600'
                      : 'text-foreground'
                  }`}
                >
                  {transaction.type === 'credit' ? '+' : '-'}
                  {formatCurrency(transaction.amount, transaction.currency)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge
                  categoryId={transaction.category || Category.Uncategorized}
                  size="sm"
                />
                <ConfidenceBadge
                  confidence={transaction.categoryConfidence || 0}
                />
                {(transaction.tags ?? []).map((tag) => (
                  <span
                    key={`${transaction.id}-${tag}`}
                    className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                  >
                    #{tag}
                  </span>
                ))}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {getAccountIcon(transaction.source)}
                  {getAccountLabel(transaction.source)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Editar ${displayDescription}`}
                  disabled={pendingTransactionId === transaction.id}
                  onClick={() => startEditTransaction(transaction)}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Eliminar ${displayDescription}`}
                  disabled={pendingTransactionId === transaction.id}
                  onClick={() => {
                    void handleDeleteTransaction(transaction)
                  }}
                >
                  <Trash2 size={14} />
                  Eliminar
                </Button>
              </div>
            </div>
              )
            })()
          ))}
        </div>
      </Card>

      <Dialog open={editingTransaction !== null} onOpenChange={(open) => !open && resetEditState()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar transacción</DialogTitle>
            <DialogDescription>
              Actualizá descripción visible, categoría y tags.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Descripción visible</label>
              <Input
                aria-label="Descripción edición"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
              {editingTransaction && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Original: {editingTransaction.description}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">
                Aplicar cambios de descripción/categoría
              </label>
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="apply-scope"
                    value="single"
                    checked={applyScope === 'single'}
                    onChange={() => setApplyScope('single')}
                  />
                  Solo esta transacción
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="apply-scope"
                    value="matching_past_and_future"
                    aria-label="Aplicar a todas las transacciones similares"
                    checked={applyScope === 'matching_past_and_future'}
                    onChange={() => setApplyScope('matching_past_and_future')}
                  />
                  Todas las similares (pasadas y futuras)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="apply-scope"
                    value="future_matching_only"
                    aria-label="Aplicar a transacciones futuras similares"
                    checked={applyScope === 'future_matching_only'}
                    onChange={() => setApplyScope('future_matching_only')}
                  />
                  Esta y futuras similares
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Categoría</label>
              <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Categoría dropdown"
                    className="mt-1 w-full min-h-9 rounded-md border border-input bg-input-background px-2 py-1 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CategoryBadge
                        categoryId={editCategory || Category.Uncategorized}
                        size="sm"
                      />
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                  <div className="p-2 space-y-2">
                    <Input
                      aria-label="Nueva categoría"
                      value={newCategoryInput}
                      onChange={(event) => setNewCategoryInput(event.target.value)}
                      placeholder="Buscar o crear categoría"
                    />
                    <div
                      className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheel={(event) => event.stopPropagation()}
                      onTouchMove={(event) => event.stopPropagation()}
                    >
                        <button
                          type="button"
                          className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            setEditCategory('')
                            setCategoryPickerOpen(false)
                          }}
                        >
                          <CategoryBadge
                            categoryId={Category.Uncategorized}
                            size="sm"
                          />
                        </button>
                        {filteredCategorySuggestions.map((category) => (
                          <button
                            key={category}
                            type="button"
                            className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => {
                              setEditCategory(category)
                              setCategoryPickerOpen(false)
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <CategoryBadge
                                categoryId={category}
                                size="sm"
                              />
                            </div>
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Crear categoría"
                      className="w-full"
                      onClick={() => {
                        handleAddCategory()
                        setCategoryPickerOpen(false)
                      }}
                    >
                      Crear categoría
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium">Tags</label>
              <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Tags dropdown"
                    className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
                  >
                    {editTagList.length > 0
                      ? `${editTagList.length} tags seleccionados`
                      : 'Sin tags'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                  <div className="p-2 space-y-2">
                    <Input
                      aria-label="Nuevo tag"
                      value={newTagInput}
                      onChange={(event) => setNewTagInput(event.target.value)}
                      placeholder="Buscar o crear tag"
                    />
                    <div
                      className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheel={(event) => event.stopPropagation()}
                      onTouchMove={(event) => event.stopPropagation()}
                    >
                        {filteredTagSuggestions.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => {
                              handleAddTag(tag)
                              setTagPickerOpen(false)
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Crear tag"
                      className="w-full"
                      onClick={() => {
                        handleAddInlineTag()
                        setTagPickerOpen(false)
                      }}
                    >
                      Crear tag
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {editTagList.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {editTagList.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      aria-label={`Quitar tag ${tag}`}
                      onClick={() => handleRemoveTag(tag)}
                      className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {editError && (
              <p className="text-sm text-destructive" role="alert">
                {editError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetEditState}
              disabled={Boolean(editingTransaction && pendingTransactionId === editingTransaction.id)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleSaveEditTransaction()
              }}
              disabled={Boolean(editingTransaction && pendingTransactionId === editingTransaction.id)}
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEditOpen} onOpenChange={(open) => !open && closeBulkEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {selectionCount} transacción{selectionCount === 1 ? '' : 'es'}</DialogTitle>
            <DialogDescription>
              Cambiá categoría y tags de las transacciones seleccionadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {onBulkCategorize && (
              <div>
                <label className="text-sm font-medium">Categoría</label>
                <Popover open={bulkCategoryPickerOpen} onOpenChange={setBulkCategoryPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Categoría bulk dropdown"
                      className="mt-1 w-full min-h-9 rounded-md border border-input bg-input-background px-2 py-1 text-left hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        {bulkEditCategory ? (
                          <CategoryBadge
                            categoryId={bulkEditCategory}
                            size="sm"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Sin cambios
                          </span>
                        )}
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[320px]" align="start">
                    <div className="p-2 space-y-2">
                      <Input
                        aria-label="Buscar categoría"
                        value={bulkCategorySearch}
                        onChange={(event) => setBulkCategorySearch(event.target.value)}
                        placeholder="Buscar categoría..."
                      />
                      <div
                        className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                        onWheel={(event) => event.stopPropagation()}
                        onTouchMove={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            setBulkEditCategory('')
                            setBulkCategoryPickerOpen(false)
                          }}
                        >
                          <span className="text-muted-foreground">Sin cambios</span>
                        </button>
                        {bulkFilteredCategories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => {
                              setBulkEditCategory(category)
                              setBulkCategoryPickerOpen(false)
                            }}
                          >
                            <CategoryBadge categoryId={category} size="sm" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {onBulkTag && (
              <div>
                <label className="text-sm font-medium">Tags</label>
                <Popover open={bulkTagPickerOpen} onOpenChange={setBulkTagPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Tags bulk dropdown"
                      className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
                    >
                      {bulkEditTagList.length > 0
                        ? `${bulkEditTagList.length} tag${bulkEditTagList.length === 1 ? '' : 's'} a agregar`
                        : 'Sin cambios'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[320px]" align="start">
                    <div className="p-2 space-y-2">
                      <Input
                        aria-label="Buscar o crear tag"
                        value={bulkTagSearch}
                        onChange={(event) => setBulkTagSearch(event.target.value)}
                        placeholder="Buscar o crear tag..."
                      />
                      <div
                        className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                        style={{ WebkitOverflowScrolling: 'touch' }}
                        onWheel={(event) => event.stopPropagation()}
                        onTouchMove={(event) => event.stopPropagation()}
                      >
                        {bulkFilteredTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className={`w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${bulkEditTagList.includes(tag) ? 'bg-accent' : ''}`}
                            onClick={() => {
                              setBulkEditTagList((prev) =>
                                prev.includes(tag)
                                  ? prev.filter((t) => t !== tag)
                                  : [...prev, tag]
                              )
                            }}
                          >
                            #{tag}
                            {bulkEditTagList.includes(tag) && ' ✓'}
                          </button>
                        ))}
                      </div>
                      {bulkTagSearch.trim() && !tagSuggestions.includes(bulkTagSearch.trim()) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            const newTag = bulkTagSearch.trim()
                            setBulkEditTagList((prev) =>
                              prev.includes(newTag) ? prev : [...prev, newTag]
                            )
                            setBulkTagSearch('')
                          }}
                        >
                          Crear tag &quot;{bulkTagSearch.trim()}&quot;
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {bulkEditTagList.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {bulkEditTagList.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-label={`Quitar tag ${tag}`}
                        onClick={() =>
                          setBulkEditTagList((prev) => prev.filter((t) => t !== tag))
                        }
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                      >
                        #{tag} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeBulkEdit} disabled={isBulkOperating}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleBulkEditSave()
              }}
              disabled={isBulkOperating || (!bulkEditCategory && bulkEditTagList.length === 0)}
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length === 0
            ? 'Mostrando 0 de 0'
            : `Mostrando ${startIndex + 1}-${Math.min(
                startIndex + itemsPerPage,
                filteredTransactions.length
              )} de ${filteredTransactions.length}`}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
              const page = index + 1
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-10"
                >
                  {page}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === safeTotalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
