import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from './ui/page-header'
import { toast } from 'sonner'
import { requireRepository } from '../services/repository/repository'
import { countSimilarEditReach } from '../services/descriptions/similar-transactions'
import { Download, X } from 'lucide-react'
import { Button } from './ui/button'
import { Category } from '../models'
import type { Transaction } from '../models'
import { useTransactionFiltering } from '../hooks/useTransactionFiltering'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { EditTransactionDraft } from './EditTransactionDialog'
import { BulkEditDialog } from './BulkEditDialog'
import { SplitTransactionDialog } from './SplitTransactionDialog'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { todayAsUtcDate } from '../utils/date-utils'
import { exportTransactions } from '../services/export/export'
import {
  addCustomCategoryWithSync,
  DEFAULT_CATEGORY_COLOR,
} from '../services/categories/category-store'
import {
  buildCategorySuggestions,
  buildTagSuggestions,
} from '../services/suggestions/suggestions'
import {
  DEFAULT_URL_FILTERS,
  serializeFilterParams,
  type UrlFilterState,
} from '../services/filters/url-filters'
import { getPeriodLabel } from '../services/filters/period-label'
import { MonthNav } from './transactions/MonthNav'
import { TotalsStrip } from './transactions/TotalsStrip'
import { BulkBar } from './transactions/BulkBar'
import { TransactionsPagination } from './transactions/TransactionsPagination'
import { useMutationFeedback } from './transactions/useMutationFeedback'
import { useRowSelection } from './transactions/useRowSelection'
import { useBulkActions } from './transactions/useBulkActions'
import type { TransactionsProps } from './transactions/transactions-props'

export function Transactions({
  transactions,
  initialFilters = DEFAULT_URL_FILTERS,
  onFiltersChange,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onUpdateTransaction,
  onDeleteTransaction,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkDelete,
  onBulkTag,
  onSplitTransaction,
  onUnsplitTransaction,
  onRestoreTransactions,
  onReload,
  repository,
}: TransactionsProps) {
  /* ---- Filter state (period included) ---- */
  // The URL's filters, with the view's default period filled in once: a link
  // that filters by category/account/currency but names no period means all
  // time; a plain visit starts on the newest month.
  const [initialState] = useState<UrlFilterState>(() => {
    if (initialFilters.period) return initialFilters
    const deepLinked =
      initialFilters.categories.length > 0 ||
      initialFilters.accounts.length > 0 ||
      initialFilters.currency !== 'all'
    if (deepLinked || transactions.length === 0) {
      return { ...initialFilters, period: { mode: 'all' } }
    }
    const newest = new Date(
      Math.max(...transactions.map((tx) => tx.date.getTime()))
    )
    return {
      ...initialFilters,
      period: {
        mode: 'month',
        y: newest.getUTCFullYear(),
        m: newest.getUTCMonth(),
      },
    }
  })

  const {
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
    currentPage,
    setCurrentPage,
    safeTotalPages,
    startIndex,
    paginatedTransactions,
    displayedRowCount,
    paginatedTransactionIds,
    filteredTransactionIds,
    clearAllFilters,
  } = useTransactionFiltering({
    transactions,
    initial: initialState,
  })

  // Keep the URL in step with the filters (the parent decides how). The hook
  // holds them in the URL's shape, period included.
  useEffect(() => {
    if (!onFiltersChange) return
    onFiltersChange(serializeFilterParams(filters))
  }, [onFiltersChange, filters])

  const newestForNav =
    newestDate ??
    (transactions.length > 0
      ? new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
      : todayAsUtcDate())

  /* ---- Edit state ---- */
  // Rows with a mutation in flight. A set, not a single id, so two
  // overlapping deletes don't re-enable each other's buttons.
  const [pendingTransactionIds, setPendingTransactionIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  function setPending(transactionId: string, pending: boolean) {
    setPendingTransactionIds((current) => {
      const next = new Set(current)
      if (pending) next.add(transactionId)
      else next.delete(transactionId)
      return next
    })
  }

  const {
    reportError,
    reportDeleted,
    deleteWithConfirmation,
    confirmDeletion,
    confirmDialog,
  } = useMutationFeedback({ onReload, onRestoreTransactions })

  const {
    selectedTransactionIds,
    setSelectedTransactionIds,
    toggleTransactionSelection,
    handleSelectAllFiltered,
    handleHeaderCheckboxChange,
    selectionCount,
    hasSelection,
    allPageSelected,
    somePageSelected,
  } = useRowSelection({
    transactions,
    paginatedTransactionIds,
    filteredTransactionIds,
  })

  const {
    isAutoCategorizing,
    isBulkOperating,
    isBusy,
    handleAutoCategorizeSelected,
    handleBulkCategorizeSelected,
    handleBulkIgnore,
    handleBulkDelete,
    openBulkEdit,
    closeBulkEdit,
    handleBulkEditSave,
    bulkEdit,
  } = useBulkActions({
    selectedTransactionIds,
    setSelectedTransactionIds,
    onAutoCategorizeTransactions,
    onBulkCategorize,
    onBulkTag,
    onBulkDelete,
    onReload,
    reportError,
    reportDeleted,
    deleteWithConfirmation,
  })

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)

  const [splittingTransaction, setSplittingTransaction] =
    useState<Transaction | null>(null)
  const [splitPending, setSplitPending] = useState(false)

  // Not memoized: custom categories live outside React state, and the list
  // is short, so rebuilding it each render keeps a category created in the
  // edit dialog visible to the bulk pickers.
  const categorySuggestions = buildCategorySuggestions()

  const tagSuggestions = useMemo(
    () => buildTagSuggestions(transactions.flatMap((tx) => tx.tags ?? [])),
    [transactions]
  )

  // Same matching the apply-to-similar write uses, so the number the
  // dialog shows is the number of rows the save will touch.
  function countSimilar(transaction: Transaction, renamed: boolean) {
    return countSimilarEditReach(transactions, transaction, renamed)
  }

  async function handleCreateCategory(label: string) {
    try {
      const created = await addCustomCategoryWithSync(
        requireRepository(repository),
        {
          label,
          color: DEFAULT_CATEGORY_COLOR,
          icon: '🏷️',
        }
      )
      return created
    } catch (error) {
      reportError(error, 'No se pudo crear la categoría')
      return undefined
    }
  }

  async function handleSaveEditTransaction(draft: EditTransactionDraft) {
    if (!onUpdateTransaction || !editingTransaction) return
    const editingId = editingTransaction.id
    setPending(editingId, true)
    try {
      const { affected } = await onUpdateTransaction(editingId, {
        displayDescription: draft.description,
        category: draft.category,
        tags: draft.tags,
        applyScope: draft.applyScope,
      })
      toast.success(
        affected > 1
          ? `Cambios aplicados a ${affected} transacciones`
          : 'Cambios guardados'
      )
      setEditingTransaction(null)
    } catch (error) {
      // The dialog stays open so the user can retry.
      reportError(error, 'No se pudieron guardar los cambios')
    } finally {
      setPending(editingId, false)
    }
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    if (!onDeleteTransaction) return
    setPending(transaction.id, true)
    try {
      const result = await deleteWithConfirmation(
        (allowIrreversible) =>
          onDeleteTransaction(transaction.id, { allowIrreversible }),
        {
          title: '¿Eliminar transacción dividida?',
          description:
            'Las partes divididas se eliminan definitivamente. Esta acción no se puede deshacer.',
        }
      )
      if (result) reportDeleted(result)
    } catch (error) {
      reportError(error, 'No se pudo eliminar la transacción')
    } finally {
      setPending(transaction.id, false)
    }
  }

  async function handleConfirmSplit(
    parts: Array<{ description: string; amount: number; category?: string }>
  ) {
    if (!splittingTransaction || !onSplitTransaction) return
    setSplitPending(true)
    try {
      const result = await onSplitTransaction(splittingTransaction.id, parts)
      toast.success(`Transacción dividida en ${result.parts} partes`)
      setSplittingTransaction(null)
    } catch (error) {
      reportError(error, 'No se pudo dividir la transacción')
    } finally {
      setSplitPending(false)
    }
  }

  async function handleUnsplit(transaction: Transaction) {
    if (!onUnsplitTransaction) return
    const confirmed = await confirmDeletion({
      title: '¿Restaurar transacción?',
      description:
        'Se eliminarán las partes divididas y la transacción original se restaurará.',
      confirmLabel: 'Restaurar',
    })
    if (!confirmed) return
    setPending(transaction.id, true)
    try {
      await onUnsplitTransaction(transaction.id)
      toast.success('División deshecha')
    } catch (error) {
      reportError(error, 'No se pudo restaurar la transacción')
    } finally {
      setPending(transaction.id, false)
    }
  }

  const periodLabelText = getPeriodLabel(period)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transacciones"
        subtitle={
          <>
            {filteredTransactions.length} movimiento
            {filteredTransactions.length !== 1 ? 's' : ''}
            {hasActiveFilters ? ' · filtrado' : ''} · {periodLabelText}
          </>
        }
        actions={
          <>
            <MonthNav
              period={period}
              setPeriod={setPeriod}
              newest={newestForNav}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportTransactions(filteredTransactions, { format: 'csv' })
              }
              className="gap-[6px]"
            >
              <Download size={15} />
              Exportar
            </Button>
          </>
        }
      >
        {merchantFilter && (
          <button
            type="button"
            onClick={() => setMerchantFilter('')}
            aria-label={`Quitar filtro de comercio ${merchantFilter}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs"
          >
            Comercio: <strong>{merchantFilter}</strong>
            <X size={12} aria-hidden />
          </button>
        )}
      </PageHeader>

      {/* Totals strip */}
      <TotalsStrip
        rows={allFilteredTransactions}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        ignoredCount={ignoredCount}
      />

      {/* Floating bulk bar — rendered before table so DOM order puts it first for a11y queries */}
      {hasSelection && (
        <BulkBar
          count={selectionCount}
          total={filteredTransactions.length}
          onSelectAll={handleSelectAllFiltered}
          onClear={() => setSelectedTransactionIds([])}
          onCategorize={(category) => {
            void handleBulkCategorizeSelected(category)
          }}
          onEdit={openBulkEdit}
          onAuto={() => {
            void handleAutoCategorizeSelected()
          }}
          onIgnore={() => {
            void handleBulkIgnore()
          }}
          onDelete={() => {
            void handleBulkDelete()
          }}
          isAutoCategorizing={isAutoCategorizing}
          isBusy={isBusy}
          categorySuggestions={categorySuggestions.filter(
            (c) => c !== Category.Uncategorized
          )}
        />
      )}

      {/* Filters */}
      <TransactionFilters
        searchTerm={searchTerm}
        dateFromFilter={dateFromFilter}
        dateToFilter={dateToFilter}
        categoryFilters={categoryFilters}
        accountFilters={accountFilters}
        currencyFilter={currencyFilter}
        typeFilter={typeFilter}
        minAmount={minAmount}
        maxAmount={maxAmount}
        availableCategories={availableCategories}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchTerm}
        onDateFromChange={setDateFromFilter}
        onDateToChange={setDateToFilter}
        onCategoryFiltersChange={setCategoryFilters}
        onAccountFiltersChange={setAccountFilters}
        onCurrencyChange={setCurrencyFilter}
        onTypeChange={setTypeFilter}
        onMinAmountChange={setMinAmount}
        onMaxAmountChange={setMaxAmount}
        onClearAll={clearAllFilters}
      />

      {/* Table */}
      <TransactionTable
        paginatedTransactions={paginatedTransactions}
        selectedTransactionIds={selectedTransactionIds}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        isBusy={isBusy}
        pendingTransactionIds={pendingTransactionIds}
        sortField={sortField}
        sortDirection={sortDirection}
        hasActiveFilters={hasActiveFilters}
        selectionCount={selectionCount}
        totalCount={filteredTransactions.length}
        showIgnored={showIgnored}
        ignoredCount={ignoredCount}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        onToggleSelect={toggleTransactionSelection}
        onHeaderCheckboxChange={handleHeaderCheckboxChange}
        onSort={handleSort}
        onClearFilters={clearAllFilters}
        onShowIgnoredChange={setShowIgnored}
        onEdit={setEditingTransaction}
        onDelete={(transaction) => {
          void handleDeleteTransaction(transaction)
        }}
        onSplit={
          onSplitTransaction
            ? (transaction) => setSplittingTransaction(transaction)
            : undefined
        }
        onUnsplit={
          onUnsplitTransaction
            ? (transaction) => {
                void handleUnsplit(transaction)
              }
            : undefined
        }
      />

      <EditTransactionDialog
        transaction={editingTransaction}
        countSimilar={countSimilar}
        knownTags={tagSuggestions}
        isSaving={
          editingTransaction !== null &&
          pendingTransactionIds.has(editingTransaction.id)
        }
        onCreateCategory={handleCreateCategory}
        onSave={(draft) => {
          void handleSaveEditTransaction(draft)
        }}
        onClose={() => setEditingTransaction(null)}
      />

      <BulkEditDialog
        open={bulkEdit.open}
        selectionCount={selectionCount}
        bulkEditCategory={bulkEdit.category}
        bulkEditTagList={bulkEdit.tagList}
        bulkCategoryPickerOpen={bulkEdit.categoryPickerOpen}
        bulkTagPickerOpen={bulkEdit.tagPickerOpen}
        bulkCategorySearch={bulkEdit.categorySearch}
        bulkTagSearch={bulkEdit.tagSearch}
        categorySuggestions={categorySuggestions}
        tagSuggestions={tagSuggestions}
        isBulkOperating={isBulkOperating}
        showCategorySection={Boolean(onBulkCategorize)}
        showTagSection={Boolean(onBulkTag)}
        onBulkEditCategoryChange={bulkEdit.setCategory}
        onBulkEditTagListChange={bulkEdit.setTagList}
        onBulkCategoryPickerOpenChange={bulkEdit.setCategoryPickerOpen}
        onBulkTagPickerOpenChange={bulkEdit.setTagPickerOpen}
        onBulkCategorySearchChange={bulkEdit.setCategorySearch}
        onBulkTagSearchChange={bulkEdit.setTagSearch}
        onSave={() => {
          void handleBulkEditSave()
        }}
        onCancel={closeBulkEdit}
      />

      {/* Pagination */}
      <TransactionsPagination
        filteredCount={filteredTransactions.length}
        startIndex={startIndex}
        pageRowCount={paginatedTransactions.length}
        displayedRowCount={displayedRowCount}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        safeTotalPages={safeTotalPages}
      />

      {confirmDialog}

      <SplitTransactionDialog
        open={splittingTransaction !== null}
        transaction={splittingTransaction}
        pending={splitPending}
        onConfirm={handleConfirmSplit}
        onCancel={() => setSplittingTransaction(null)}
      />
    </div>
  )
}
