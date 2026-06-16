import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Category } from '../models'
import type { Transaction } from '../models'
import { getCategoryDisplay } from '../utils/category-display'
import { getDisplayDescription } from '../utils/transaction-display'
import { useTransactionFiltering } from '../hooks/useTransactionFiltering'
import { EditTransactionDialog } from './EditTransactionDialog'
import { BulkEditDialog } from './BulkEditDialog'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { formatCurrency } from '../utils/formatting'
import { exportTransactions } from '../services/export/export'
import {
  addCustomCategory,
  listCustomCategories,
  syncCustomCategoryToCloud,
} from '../services/categories/category-store'
import type { TransactionsFilter } from '../models'

interface TransactionsProps {
  transactions: Transaction[]
  initialFilter?: TransactionsFilter
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

export function Transactions({
  transactions,
  initialFilter,
  onUpdateTransaction,
  onDeleteTransaction,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkDelete,
  onBulkTag,
}: TransactionsProps) {
  const {
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
    safeTotalPages,
    startIndex,
    paginatedTransactions,
    paginatedTransactionIds,
    filteredTransactionIds,
    clearAllFilters,
  } = useTransactionFiltering({ transactions, initialFilter })

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

  const categorySuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...Object.values(Category),
          ...listCustomCategories().map((c) => c.id),
          editCategory,
        ]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) =>
      getCategoryDisplay(a).label.localeCompare(getCategoryDisplay(b).label, 'es')
    )
  }, [editCategory])

  const filteredCategorySuggestions = useMemo(() => {
    const query = newCategoryInput.trim().toLowerCase()
    const base = categorySuggestions.filter(
      (c) => c !== Category.Uncategorized
    )
    if (!query) return base

    return base.filter((category) => {
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

  useEffect(() => {
    const validIds = new Set(transactions.map((transaction) => transaction.id))
    setSelectedTransactionIds((current) =>
      current.filter((transactionId) => validIds.has(transactionId))
    )
  }, [transactions])


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
    const created = addCustomCategory({ label: value, color: '#0ea5e9', icon: '🏷️' })
    setEditCategory(created.id)
    setNewCategoryInput('')
    void syncCustomCategoryToCloud(created.id)
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
      toast.success('Cambios guardados')
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

    const count = selectedTransactionIds.length
    setIsAutoCategorizing(true)
    try {
      await onAutoCategorizeTransactions(selectedTransactionIds)
      setSelectedTransactionIds([])
      toast.success(`${count} transacción${count === 1 ? '' : 'es'} categorizad${count === 1 ? 'a' : 'as'}`)
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

    const count = selectedTransactionIds.length
    setIsBulkOperating(true)
    try {
      await onBulkDelete(selectedTransactionIds)
      setSelectedTransactionIds([])
      toast.success(`${count} transacción${count === 1 ? '' : 'es'} eliminada${count === 1 ? '' : 's'}`)
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

    const count = selectedTransactionIds.length
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
      toast.success(`${count} transacción${count === 1 ? '' : 'es'} actualizada${count === 1 ? '' : 's'}`)
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
      setSelectedTransactionIds((current) =>
        current.filter((id) => !paginatedTransactionIds.includes(id))
      )
    }
  }

  return (
    <div className="space-y-6">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Transacciones</h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            {filteredTransactions.length} de {transactions.length} movimientos
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportTransactions(filteredTransactions, { format: 'csv' })}
          style={{ gap: 6 }}
        >
          <Download size={15} />
          Exportar
        </Button>
      </div>

      <TransactionFilters
        searchTerm={searchTerm}
        dateFromFilter={dateFromFilter}
        dateToFilter={dateToFilter}
        categoryFilter={categoryFilter}
        accountFilter={accountFilter}
        currencyFilter={currencyFilter}
        typeFilter={typeFilter}
        availableCategories={availableCategories}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchTerm}
        onDateFromChange={setDateFromFilter}
        onDateToChange={setDateToFilter}
        onCategoryChange={setCategoryFilter}
        onAccountChange={setAccountFilter}
        onCurrencyChange={setCurrencyFilter}
        onTypeChange={setTypeFilter}
        onClearAll={clearAllFilters}
      />

      {hasSelection && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" role="status" aria-live="polite">
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
              {isAutoCategorizing ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={14} className="mr-1.5" />
              )}
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

      {(() => {
        const currencyGroups = activeCurrencies.filter((currency) =>
          currencyFilter !== 'all' ? currency === currencyFilter : true
        )
        if (currencyGroups.length === 0) return null
        return (
          <div
            role="region"
            aria-label="Resumen de transacciones filtradas"
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
          {currencyGroups.map((currency) => {
              const net = totals.net[currency]
              return (
                <div
                  key={currency}
                  style={{
                    display: 'flex',
                    gap: 6,
                    background: 'var(--surface-2)',
                    borderRadius: 10,
                    padding: '6px 4px',
                  }}
                >
                  {[
                    {
                      label: 'Ingresos',
                      amount: totals.income[currency],
                      color: 'var(--text)',
                    },
                    {
                      label: 'Gastos',
                      amount: totals.expense[currency],
                      color: 'var(--text)',
                    },
                    {
                      label: 'Neto',
                      amount: net,
                      color:
                        net > 0
                          ? 'var(--color-success, #16a34a)'
                          : net < 0
                            ? 'var(--color-destructive, #dc2626)'
                            : 'var(--text)',
                    },
                  ].map(({ label, amount, color }) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '2px 12px',
                        borderRadius: 7,
                        minWidth: 90,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-faint)',
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 2,
                        }}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatCurrency(amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )
      })()}

      <TransactionTable
        paginatedTransactions={paginatedTransactions}
        selectedTransactionIds={selectedTransactionIds}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        isBusy={isBusy}
        pendingTransactionId={pendingTransactionId}
        sortField={sortField}
        sortDirection={sortDirection}
        hasActiveFilters={hasActiveFilters}
        onToggleSelect={toggleTransactionSelection}
        onHeaderCheckboxChange={handleHeaderCheckboxChange}
        onSort={handleSort}
        onClearFilters={clearAllFilters}
        onEdit={startEditTransaction}
        onDelete={(transaction) => {
          void handleDeleteTransaction(transaction)
        }}
      />

      <EditTransactionDialog
        editingTransaction={editingTransaction}
        editDescription={editDescription}
        editCategory={editCategory}
        editTagList={editTagList}
        applyScope={applyScope}
        editError={editError}
        categoryPickerOpen={categoryPickerOpen}
        tagPickerOpen={tagPickerOpen}
        newCategoryInput={newCategoryInput}
        newTagInput={newTagInput}
        filteredCategorySuggestions={filteredCategorySuggestions}
        filteredTagSuggestions={filteredTagSuggestions}
        pendingTransactionId={pendingTransactionId}
        onDescriptionChange={setEditDescription}
        onCategoryChange={setEditCategory}
        onApplyScopeChange={setApplyScope}
        onCategoryPickerOpenChange={setCategoryPickerOpen}
        onTagPickerOpenChange={setTagPickerOpen}
        onNewCategoryInputChange={setNewCategoryInput}
        onNewTagInputChange={setNewTagInput}
        onAddCategory={handleAddCategory}
        onAddTag={handleAddTag}
        onAddInlineTag={handleAddInlineTag}
        onRemoveTag={handleRemoveTag}
        onSave={() => {
          void handleSaveEditTransaction()
        }}
        onCancel={resetEditState}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        selectionCount={selectionCount}
        bulkEditCategory={bulkEditCategory}
        bulkEditTagList={bulkEditTagList}
        bulkCategoryPickerOpen={bulkCategoryPickerOpen}
        bulkTagPickerOpen={bulkTagPickerOpen}
        bulkCategorySearch={bulkCategorySearch}
        bulkTagSearch={bulkTagSearch}
        bulkFilteredCategories={bulkFilteredCategories}
        bulkFilteredTags={bulkFilteredTags}
        tagSuggestions={tagSuggestions}
        isBulkOperating={isBulkOperating}
        showCategorySection={Boolean(onBulkCategorize)}
        showTagSection={Boolean(onBulkTag)}
        onBulkEditCategoryChange={setBulkEditCategory}
        onBulkEditTagListChange={setBulkEditTagList}
        onBulkCategoryPickerOpenChange={setBulkCategoryPickerOpen}
        onBulkTagPickerOpenChange={setBulkTagPickerOpen}
        onBulkCategorySearchChange={setBulkCategorySearch}
        onBulkTagSearchChange={setBulkTagSearch}
        onSave={() => {
          void handleBulkEditSave()
        }}
        onCancel={closeBulkEdit}
      />

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length === 0
            ? 'Mostrando 0 de 0'
            : `Mostrando ${startIndex + 1}-${startIndex + paginatedTransactions.length} de ${filteredTransactions.length}`}
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
            {(() => {
              const pages: (number | '...')[] = []
              if (safeTotalPages <= 7) {
                for (let i = 1; i <= safeTotalPages; i++) pages.push(i)
              } else {
                pages.push(1)
                if (currentPage > 3) pages.push('...')
                for (
                  let i = Math.max(2, currentPage - 1);
                  i <= Math.min(safeTotalPages - 1, currentPage + 1);
                  i++
                )
                  pages.push(i)
                if (currentPage < safeTotalPages - 2) pages.push('...')
                pages.push(safeTotalPages)
              }
              return pages.map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={currentPage === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(p)}
                    className="w-10"
                  >
                    {p}
                  </Button>
                )
              )
            })()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.min(safeTotalPages, page + 1))}
            disabled={currentPage === safeTotalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
