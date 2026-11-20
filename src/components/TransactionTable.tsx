import type { ReactNode } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import { Button } from './ui/button'
import { EmptyState } from './EmptyState'
import { Card } from './ui/card'
import { Checkbox } from './ui/checkbox'
import type { Transaction } from '../models'
import type { SortField, SortDirection } from '../hooks/useTransactionFiltering'
import { TransactionRow } from './transactions/TransactionRow'
import { TransactionCard } from './transactions/TransactionCard'
import type { CategorySplit } from '../services/descriptions/category-splits'

// Kept importable from here (EditTransactionDialog uses it).
export { getAccountLabel } from './transactions/transaction-row-parts'

interface TransactionTableProps {
  // The filter bar, drawn as this card's header.
  filters?: ReactNode
  paginatedTransactions: Transaction[]
  selectedTransactionIds: string[]
  allPageSelected: boolean
  somePageSelected: boolean
  isBusy: boolean
  pendingTransactionIds: ReadonlySet<string>
  sortField: SortField
  sortDirection: SortDirection
  hasActiveFilters: boolean
  selectionCount: number
  totalCount: number
  showIgnored: boolean
  ignoredCount: number
  homeCurrency?: string
  fxRate?: number
  onToggleSelect: (id: string, checked: boolean) => void
  onHeaderCheckboxChange: (checked: boolean) => void
  onSort: (field: SortField) => void
  onClearFilters: () => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onSplit?: (transaction: Transaction) => void
  onUnsplit?: (transaction: Transaction) => void
  onToggleHousehold?: (transaction: Transaction) => void
  onCategorize?: (transaction: Transaction, categoryId: string) => void
  // Per row id: merchants split across categories (the ≠ hint).
  categorySplits?: ReadonlyMap<string, CategorySplit>
}

export function TransactionTable({
  filters,
  paginatedTransactions,
  selectedTransactionIds,
  allPageSelected,
  somePageSelected,
  isBusy,
  pendingTransactionIds,
  sortField,
  sortDirection,
  hasActiveFilters,
  selectionCount,
  totalCount,
  showIgnored,
  ignoredCount,
  homeCurrency,
  fxRate,
  onToggleSelect,
  onHeaderCheckboxChange,
  onSort,
  onClearFilters,
  onEdit,
  onDelete,
  onSplit,
  onUnsplit,
  onToggleHousehold,
  onCategorize,
  categorySplits,
}: TransactionTableProps) {
  return (
    <Card
      role="region"
      aria-label="Movimientos"
      // No overflow-hidden here: the filter dropdowns in the header must
      // overlay the rows. Only the body below clips to the card's corners.
      className="gap-0"
    >
      {filters}
      {/* Toolbar row: selection count + hidden-transfers hint */}
      <div className="flex flex-wrap items-center justify-between gap-x-[12px] gap-y-1 border-b border-[var(--border)] px-[16px] py-[10px]">
        <span
          className="text-[13px] text-[color:var(--text-muted)]"
          role="status"
          aria-live="polite"
        >
          {selectionCount > 0
            ? `${selectionCount} de ${totalCount} seleccionada${selectionCount !== 1 ? 's' : ''}`
            : `${totalCount} movimiento${totalCount !== 1 ? 's' : ''} en la vista`}
        </span>
        {!showIgnored && ignoredCount > 0 && (
          // Plain text, outside the live region: rows are hidden, and the
          // Filtros panel's toggle is where they come back.
          <span className="text-[13px] text-[color:var(--text-muted)]">
            {ignoredCount === 1
              ? '1 movimiento oculto'
              : `${ignoredCount} movimientos ocultos`}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-b-xl">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-3.5 py-3 w-10">
                  <Checkbox
                    aria-label="Seleccionar todas"
                    checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(checked) =>
                      onHeaderCheckboxChange(checked === true)
                    }
                    disabled={paginatedTransactions.length === 0 || isBusy}
                  />
                </th>
                <th
                  className="text-left px-3.5 py-3 text-label font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  aria-sort={
                    sortField === 'date'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => onSort('date')}
                    className="flex items-center gap-2 text-label font-bold uppercase tracking-[0.05em] hover:text-primary transition-colors"
                  >
                    Fecha
                    {sortField === 'date' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th
                  className="text-left px-3.5 py-3 text-label font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  aria-sort={
                    sortField === 'description'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => onSort('description')}
                    className="flex items-center gap-2 text-label font-bold uppercase tracking-[0.05em] hover:text-primary transition-colors"
                  >
                    Descripción
                    {sortField === 'description' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th
                  className="text-left px-3.5 py-3 text-label font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  aria-sort={
                    sortField === 'category'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => onSort('category')}
                    className="flex items-center gap-2 text-label font-bold uppercase tracking-[0.05em] hover:text-primary transition-colors"
                  >
                    Categoría
                    {sortField === 'category' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left px-3.5 py-3 text-label font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  Cuenta
                </th>
                <th
                  className="text-right px-3.5 py-3 text-label font-bold uppercase tracking-[0.05em] text-muted-foreground"
                  aria-sort={
                    sortField === 'amount'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    onClick={() => onSort('amount')}
                    className="flex items-center gap-2 ml-auto text-label font-bold uppercase tracking-[0.05em] hover:text-primary transition-colors"
                  >
                    Monto
                    {sortField === 'amount' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-center px-3.5 py-3 text-label font-bold uppercase tracking-[0.05em] text-muted-foreground w-36">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 && hasActiveFilters && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      compact
                      tone="neutral"
                      icon={Search}
                      title="Sin resultados"
                      description="Ningún movimiento coincide con estos filtros. Probá ampliar el rango o limpiarlos."
                      action={
                        <Button size="sm" onClick={onClearFilters}>
                          Limpiar filtros
                        </Button>
                      }
                    />
                  </td>
                </tr>
              )}
              {paginatedTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  selectedTransactionIds={selectedTransactionIds}
                  isBusy={isBusy}
                  pendingTransactionIds={pendingTransactionIds}
                  homeCurrency={homeCurrency}
                  fxRate={fxRate}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onSplit={onSplit}
                  onUnsplit={onUnsplit}
                  onToggleHousehold={onToggleHousehold}
                  onCategorize={onCategorize}
                  categorySplit={categorySplits?.get(transaction.id)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-border">
          {paginatedTransactions.length > 0 && (
            <div className="p-4 flex items-center gap-3 bg-muted/30">
              <Checkbox
                aria-label="Seleccionar todas"
                checked={
                  allPageSelected
                    ? true
                    : somePageSelected
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) =>
                  onHeaderCheckboxChange(checked === true)
                }
                disabled={isBusy}
              />
              <span className="text-sm text-muted-foreground">
                Seleccionar todas
              </span>
            </div>
          )}
          {paginatedTransactions.length === 0 && hasActiveFilters && (
            <EmptyState
              compact
              tone="neutral"
              icon={Search}
              title="Sin resultados"
              description="Ningún movimiento coincide con estos filtros. Probá ampliar el rango o limpiarlos."
              action={
                <Button size="sm" onClick={onClearFilters}>
                  Limpiar filtros
                </Button>
              }
            />
          )}
          {paginatedTransactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              selectedTransactionIds={selectedTransactionIds}
              isBusy={isBusy}
              pendingTransactionIds={pendingTransactionIds}
              homeCurrency={homeCurrency}
              fxRate={fxRate}
              onToggleSelect={onToggleSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onSplit={onSplit}
              onUnsplit={onUnsplit}
              onToggleHousehold={onToggleHousehold}
              onCategorize={onCategorize}
              categorySplit={categorySplits?.get(transaction.id)}
            />
          ))}
        </div>
      </div>
    </Card>
  )
}
