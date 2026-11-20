import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast, type ExternalToast } from 'sonner'
import { requireRepository } from '../services/repository/repository'
import { defaultsToAllSimilar } from '../services/descriptions/default-scope'
import { countSimilarEditReach } from '../services/descriptions/similar-transactions'
import { DEFAULT_CATEGORY_COLOR } from '../models'
import type { Transaction } from '../models'
import { useTransactionFiltering } from '../hooks/useTransactionFiltering'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { EditTransactionDraft } from './EditTransactionDialog'
import { SplitTransactionDialog } from './SplitTransactionDialog'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { newestDataMonth } from '../utils/date-utils'
import { addCustomCategoryWithSync } from '../services/categories/category-store'
import { buildTagSuggestions } from '../services/suggestions/suggestions'
import { isCountedExpense } from '../services/spending/spending-rules'
import {
  merchantKeyOf,
  merchantLabelFor,
} from '../services/merchants/merchant-key'
import {
  DEFAULT_URL_FILTERS,
  hasActiveFilters,
  serializeFilterParams,
  type UrlFilterState,
  type UrlPeriod,
} from '../services/filters/url-filters'
import { TransactionsHeader } from './transactions/TransactionsHeader'
import { TotalsStrip } from './transactions/TotalsStrip'
import { BulkBar } from './transactions/BulkBar'
import { BulkTagsDialog } from './transactions/BulkTagsDialog'
import { ReviewMode, ReviewModeButton } from './transactions/ReviewMode'
import { TransactionsPagination } from './transactions/TransactionsPagination'
import { useMutationFeedback } from './transactions/useMutationFeedback'
import { useRowSelection } from './transactions/useRowSelection'
import { useBulkActions } from './transactions/useBulkActions'
import { useHouseholdWrites } from './transactions/useHouseholdWrites'
import { useCategoryWrites } from './transactions/useCategoryWrites'
import { usePendingRows } from './transactions/usePendingRows'
import { rowsSharingMerchantRule } from '../services/household/household'
import type { TransactionsProps } from './transactions/transactions-props'
import { getDisplayDescription } from '../utils/transaction-display'
import { transactionLabel } from '../services/merchants/merchant-key'

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((tag, i) => tag === b[i])

export function Transactions({
  transactions,
  initialFilters = DEFAULT_URL_FILTERS,
  onFiltersChange,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onUpdateTransaction,
  onRestoreCategories,
  onDeleteTransaction,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkDelete,
  onBulkTag,
  onSplitTransaction,
  onUnsplitTransaction,
  onSetHousehold,
  onApplyHouseholdToSimilar,
  onForgetHouseholdRule,
  onRestoreTransactions,
  onReload,
  onGoToOverview,
  repository,
}: TransactionsProps) {
  /* ---- Filter state (period included) ---- */
  // The URL's filters, with the view's default period filled in once: a link
  // that filters at all (hasActiveFilters) but names no period means all
  // time; a plain visit starts on the newest month.
  const [initialState] = useState<UrlFilterState>(() => {
    if (initialFilters.period) return initialFilters
    const newest = hasActiveFilters(initialFilters)
      ? null
      : newestDataMonth(transactions)
    if (!newest) return { ...initialFilters, period: { mode: 'all' } }
    return { ...initialFilters, period: { mode: 'month', ...newest } }
  })

  const {
    filters,
    update: updateFilters,
    clear: clearFilters,
    setDateBound,
    dateRange,
    sortField,
    sortDirection,
    handleSort,
    allFilteredTransactions,
    filteredTransactions,
    ignoredCount,
    availableCategories,
    monthNav,
    currentPage,
    setCurrentPage,
    safeTotalPages,
    startIndex,
    paginatedTransactions,
    displayedRowCount,
    paginatedTransactionIds,
    filteredTransactionIds,
  } = useTransactionFiltering({
    transactions,
    initial: initialState,
  })
  const { merchant: merchantFilter, period } = filters
  const filtered = hasActiveFilters(filters)
  // Stable, like the per-field setters these children were handed before.
  const setPeriod = useCallback(
    (next: UrlPeriod) => updateFilters({ period: next }),
    [updateFilters]
  )
  const setShowIgnored = useCallback(
    (show: boolean) => updateFilters({ showIgnored: show }),
    [updateFilters]
  )

  // The merchant filter holds a merchant key (#120); the chip shows the same
  // label Resumen's "Mayores comercios" row did.
  const merchantLabel = useMemo(() => {
    if (!merchantFilter) return ''
    const rows = transactions.filter(
      (tx) => merchantKeyOf(tx) === merchantFilter
    )
    const expenses = rows.filter(isCountedExpense)
    return merchantLabelFor(expenses.length ? expenses : rows) || merchantFilter
  }, [transactions, merchantFilter])

  // Keep the URL in step with the filters (the parent decides how). The hook
  // holds them in the URL's shape, period included.
  useEffect(() => {
    if (!onFiltersChange) return
    onFiltersChange(serializeFilterParams(filters))
  }, [onFiltersChange, filters])

  /* ---- Edit state ---- */
  const { pendingTransactionIds, setPending } = usePendingRows()

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

  const categoryWrites = useCategoryWrites({
    transactions,
    onUpdateTransaction,
    onRestoreCategories,
    setPending,
    reportError,
  })

  const {
    isAutoCategorizing,
    isBulkOperating,
    isBusy,
    categorizeOpen,
    setCategorizeOpen,
    handleSuggestSelected,
    handleBulkCategorizeSelected,
    handleBulkIgnore,
    handleBulkHousehold,
    handleBulkDelete,
    tagsOpen,
    setTagsOpen,
    handleBulkTagsSave,
  } = useBulkActions({
    transactions,
    selectedTransactionIds,
    setSelectedTransactionIds,
    onAutoCategorizeTransactions,
    onBulkCategorize,
    onBulkTag,
    onBulkDelete,
    onSetHousehold,
    onReload,
    onRestoreCategories,
    rowWrites: categoryWrites.rowWrites,
    setPending,
    pendingTransactionIds,
    reportError,
    reportDeleted,
    deleteWithConfirmation,
  })

  // A write of a selected row is in flight (an in-place pick): the bar waits.
  const selectionPending = selectedTransactionIds.some((id) =>
    pendingTransactionIds.has(id)
  )

  const { handleToggleHousehold, canSaveHousehold, saveHouseholdDraft } =
    useHouseholdWrites({
      transactions,
      onSetHousehold,
      onApplyHouseholdToSimilar,
      onForgetHouseholdRule,
      setPending,
      reportError,
    })

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)

  const [splittingTransaction, setSplittingTransaction] =
    useState<Transaction | null>(null)
  const [splitPending, setSplitPending] = useState(false)

  const tagSuggestions = useMemo(
    () => buildTagSuggestions(transactions.flatMap((tx) => tx.tags ?? [])),
    [transactions]
  )

  // Same matching the apply-to-similar write uses, so the number the
  // dialog shows is the number of rows the save will touch.
  const countSimilar = useCallback(
    (transaction: Transaction, renamed: boolean) =>
      countSimilarEditReach(transactions, transaction, renamed),
    [transactions]
  )

  const defaultToAll = useCallback(
    (row: Transaction, c: string) => defaultsToAllSimilar(transactions, row, c),
    [transactions]
  )

  const countHouseholdSimilar = useCallback(
    (transaction: Transaction) =>
      rowsSharingMerchantRule(transactions, transaction).length,
    [transactions]
  )

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
    const editing = editingTransaction
    const editingId = editing.id
    // The household part runs only when the dialog says there is something to
    // write and the view can write that kind of it. A household-only save
    // must not re-write the category as the user's own (confidence 1): nothing
    // about name, category or tags changed (a name/category scope still runs).
    const householdChanged = canSaveHousehold(draft.household)
    const nameKept = draft.description === getDisplayDescription(editing)
    const unchanged =
      nameKept &&
      draft.category === ((editing.category ?? '').trim() || null) &&
      sameTags(draft.tags, editing.tags ?? [])
    let message: string | null = null
    setPending(editingId, true)
    try {
      if (!(unchanged && householdChanged && draft.applyScope === 'single')) {
        // The newest write of the row: an old in-place toast must not replay.
        categoryWrites.supersede(editingId)
        const { affected } = await onUpdateTransaction(editingId, {
          // Only a typed name: an untouched own name would spread.
          displayDescription: nameKept ? undefined : draft.description,
          category: draft.category,
          tags: draft.tags,
          applyScope: draft.applyScope,
        })
        message =
          affected > 1
            ? `Cambios aplicados a ${affected} transacciones`
            : 'Cambios guardados'
      }
    } catch (error) {
      // The dialog stays open so the user can retry.
      reportError(error, 'No se pudieron guardar los cambios')
      setPending(editingId, false)
      return
    }
    // Written after the edit it came with; one outcome is reported.
    let toastOptions: ExternalToast | undefined
    if (householdChanged) {
      const outcome = await saveHouseholdDraft(
        editingId,
        draft.household,
        // The merchant the box named, not the name being typed.
        transactionLabel(editing),
        message
      )
      if (!outcome.saved && !message && !outcome.rowSaved) {
        // Nothing saved at all: keep the dialog open to try again.
        setPending(editingId, false)
        return
      }
      message = outcome.message
      toastOptions = outcome.options
    }
    if (message) categoryWrites.toastEdit(editing, draft, message, toastOptions)
    setEditingTransaction(null)
    setPending(editingId, false)
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

  // One-shot: the entry button takes focus on the render right after leaving.
  const leftReview = useRef(false)
  useEffect(() => {
    leftReview.current = false
  })
  const leaveReview = () => {
    leftReview.current = true
    updateFilters({ reviewMode: false })
  }
  if (filters.review && filters.reviewMode) {
    return (
      <ReviewMode
        rows={filteredTransactions}
        transactions={transactions}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        writes={categoryWrites}
        pending={pendingTransactionIds}
        onLeave={leaveReview}
        onGoToOverview={onGoToOverview}
      />
    )
  }

  return (
    <div className="space-y-4">
      <TransactionsHeader
        rows={filteredTransactions}
        filtered={filtered}
        period={period}
        setPeriod={setPeriod}
        monthNav={monthNav}
        merchantLabel={merchantFilter && merchantLabel}
        onClearMerchant={() => updateFilters({ merchant: '' })}
      >
        {filters.review &&
          onUpdateTransaction &&
          filteredTransactions.length > 0 && (
            <ReviewModeButton
              autoFocus={leftReview.current}
              onClick={() => updateFilters({ reviewMode: true })}
            />
          )}
      </TransactionsHeader>

      {/* Totals strip */}
      <TotalsStrip
        rows={allFilteredTransactions}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        household={filters.household}
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
          onHousehold={
            onSetHousehold
              ? (household) => {
                  void handleBulkHousehold(household)
                }
              : undefined
          }
          onTags={onBulkTag ? () => setTagsOpen(true) : undefined}
          onSuggest={
            onAutoCategorizeTransactions
              ? () => {
                  void handleSuggestSelected()
                }
              : undefined
          }
          onIgnore={() => {
            void handleBulkIgnore()
          }}
          onDelete={() => {
            void handleBulkDelete()
          }}
          isAutoCategorizing={isAutoCategorizing}
          isBusy={isBusy || selectionPending}
          categorizeOpen={
            categorizeOpen && hasSelection && !isBusy && !selectionPending
          }
          onCategorizeOpenChange={setCategorizeOpen}
        />
      )}

      {/* Table, with the filters as its header */}
      <TransactionTable
        filters={
          <TransactionFilters
            filters={filters}
            hasActiveFilters={filtered}
            dateRange={dateRange}
            availableCategories={availableCategories}
            onChange={updateFilters}
            onDateBoundChange={setDateBound}
            onClearAll={clearFilters}
          />
        }
        paginatedTransactions={paginatedTransactions}
        selectedTransactionIds={selectedTransactionIds}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        isBusy={isBusy}
        pendingTransactionIds={pendingTransactionIds}
        sortField={sortField}
        sortDirection={sortDirection}
        hasActiveFilters={filtered}
        selectionCount={selectionCount}
        totalCount={filteredTransactions.length}
        showIgnored={filters.showIgnored}
        ignoredCount={ignoredCount}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        onToggleSelect={toggleTransactionSelection}
        onHeaderCheckboxChange={handleHeaderCheckboxChange}
        onSort={handleSort}
        onClearFilters={clearFilters}
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
        onCategorize={categoryWrites.onCategorize}
        categorySplits={categoryWrites.categorySplits}
        onToggleHousehold={
          onSetHousehold
            ? (transaction) => {
                void handleToggleHousehold(transaction)
              }
            : undefined
        }
      />

      <EditTransactionDialog
        transaction={editingTransaction}
        countSimilar={countSimilar}
        defaultToAll={defaultToAll}
        countHouseholdSimilar={countHouseholdSimilar}
        knownTags={tagSuggestions}
        canSetHousehold={Boolean(onSetHousehold)}
        canSetHouseholdRule={Boolean(
          onApplyHouseholdToSimilar && onForgetHouseholdRule
        )}
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

      <BulkTagsDialog
        open={tagsOpen}
        selectionCount={selectionCount}
        tagSuggestions={tagSuggestions}
        isBulkOperating={isBulkOperating}
        onSave={(tags) => {
          void handleBulkTagsSave(tags)
        }}
        onCancel={() => setTagsOpen(false)}
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
