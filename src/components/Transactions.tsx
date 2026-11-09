import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from './ui/page-header'
import { toast } from 'sonner'
import { requireRepository } from '../services/repository/repository'
import { countSimilarEditReach } from '../services/descriptions/similar-transactions'
import { Download, X } from 'lucide-react'
import { Button } from './ui/button'
import { Category, DEFAULT_CATEGORY_COLOR } from '../models'
import type { Transaction } from '../models'
import { useTransactionFiltering } from '../hooks/useTransactionFiltering'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { EditTransactionDraft } from './EditTransactionDialog'
import { BulkEditDialog } from './BulkEditDialog'
import { SplitTransactionDialog } from './SplitTransactionDialog'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { newestDataMonth, todayAsUtcDate } from '../utils/date-utils'
import { exportTransactions } from '../services/export/export'
import { addCustomCategoryWithSync } from '../services/categories/category-store'
import {
  buildCategorySuggestions,
  buildTagSuggestions,
} from '../services/suggestions/suggestions'
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
import { getPeriodLabel } from '../services/filters/period-label'
import { MonthNav } from './transactions/MonthNav'
import { TotalsStrip } from './transactions/TotalsStrip'
import { BulkBar } from './transactions/BulkBar'
import { TransactionsPagination } from './transactions/TransactionsPagination'
import { useMutationFeedback } from './transactions/useMutationFeedback'
import { useRowSelection } from './transactions/useRowSelection'
import { useBulkActions } from './transactions/useBulkActions'
import {
  currentCategoryHousehold,
  nextHouseholdChoice,
} from '../services/household/household'
import type { TransactionsProps } from './transactions/transactions-props'
import { getDisplayDescription } from '../utils/transaction-display'
import { UserFacingError } from '../utils/user-error'

const AFTER_EDIT = 'Se guardaron los cambios, pero no el gasto del hogar'

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((tag, i) => tag === b[i])

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
  onSetHousehold,
  onRestoreTransactions,
  onReload,
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
    newestRowDate,
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

  // `newestRowDate` is null only without rows.
  const newestForNav = newestRowDate ?? todayAsUtcDate()

  // The newest household write started per row, so an old toast's retry can
  // tell it has been superseded.
  const householdWrites = useRef(new Map<string, number>())
  // The latest rows, to see whether a row changed after a failed write.
  const transactionsRef = useRef(transactions)
  transactionsRef.current = transactions
  const rowChoice = (id: string) =>
    transactionsRef.current.find((tx) => tx.id === id)?.household ?? null

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
    handleBulkHousehold,
    handleBulkDelete,
    openBulkEdit,
    closeBulkEdit,
    handleBulkEditSave,
    bulkEdit,
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
    const editing = editingTransaction
    const editingId = editing.id
    const householdChanged =
      Boolean(onSetHousehold) && draft.household !== (editing.household ?? null)
    // A household-only save must not re-write the category as the user's own
    // confirmed one (confidence 1): nothing about name, category or tags
    // changed, and no apply-scope rule was asked for.
    const unchanged =
      draft.applyScope === 'single' &&
      draft.description === getDisplayDescription(editing) &&
      draft.category === ((editing.category ?? '').trim() || null) &&
      sameTags(draft.tags, editing.tags ?? [])
    let message: string | null = null
    setPending(editingId, true)
    try {
      if (!(unchanged && householdChanged)) {
        const { affected } = await onUpdateTransaction(editingId, {
          displayDescription: draft.description,
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
    // The choice is this row's own, written after the edit it came with. One
    // outcome is reported: the success only once everything saved, or one
    // error that says what did.
    if (householdChanged) {
      const saved = await writeHousehold(
        editingId,
        draft.household,
        message ? AFTER_EDIT : 'No se pudo guardar el gasto del hogar'
      )
      if (!saved && !message) {
        // Nothing saved at all: keep the dialog open to try again.
        setPending(editingId, false)
        return
      }
      if (!saved) message = null
    }
    if (message) toast.success(message)
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

  // One click flips the row's house. Quiet on success: the house moves when
  // the saved row comes back from the store.
  function handleToggleHousehold(transaction: Transaction) {
    void writeHousehold(
      transaction.id,
      nextHouseholdChoice(transaction, currentCategoryHousehold()),
      'No se pudo guardar el gasto del hogar'
    )
  }

  // Writes one row's choice; true when it saved. A failure that saved nothing
  // offers the same write again, but only if nothing else touched the row
  // since: no newer write of this view started (the counter) and the saved
  // row still holds what it did when this one failed (which also covers bulk
  // writes and the dialog). A newer choice is never overwritten by an old
  // toast.
  async function writeHousehold(
    id: string,
    household: boolean | null,
    failure: string
  ): Promise<boolean> {
    if (!onSetHousehold) return false
    const seq = (householdWrites.current.get(id) ?? 0) + 1
    householdWrites.current.set(id, seq)
    setPending(id, true)
    try {
      await onSetHousehold([id], household)
      return true
    } catch (error) {
      const heldWhenFailed = rowChoice(id)
      // After a saved edit, say so even when the error brings its own words.
      const prefix =
        failure === AFTER_EDIT && error instanceof UserFacingError
          ? `${AFTER_EDIT}. `
          : ''
      reportError(error, failure, prefix, () => {
        if (
          householdWrites.current.get(id) === seq &&
          rowChoice(id) === heldWhenFailed
        ) {
          void writeHousehold(id, household, failure)
        }
      })
      return false
    } finally {
      setPending(id, false)
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
            {filtered ? ' · filtrado' : ''} · {periodLabelText}
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
            onClick={() => updateFilters({ merchant: '' })}
            aria-label={`Quitar filtro de comercio ${merchantLabel}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs"
          >
            Comercio: <strong>{merchantLabel}</strong>
            <X size={12} aria-hidden />
          </button>
        )}
      </PageHeader>

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
        onToggleHousehold={onSetHousehold ? handleToggleHousehold : undefined}
      />

      <EditTransactionDialog
        transaction={editingTransaction}
        countSimilar={countSimilar}
        knownTags={tagSuggestions}
        canSetHousehold={Boolean(onSetHousehold)}
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
