import { ArrowUpDown, CreditCard, Info, Pencil, Search, Trash2, Wallet } from 'lucide-react'
import { Button } from './ui/button'
import { EmptyState } from './EmptyState'
import { Card } from './ui/card'
import { IconTile } from './ui/icon-tile'
import { Checkbox } from './ui/checkbox'
import { CategoryBadge } from './CategoryBadge'
import { ConfidenceBadge } from './ConfidenceBadge'
import { Category } from '../models'
import type { Transaction } from '../models'
import {
  isCategoryIgnored,
  getCategoryDefinition,
} from '../services/categories/category-registry'
import { getDisplayDescription } from '../utils/transaction-display'
import { formatCurrency, formatDate } from '../utils/formatting'
import type { SortField, SortDirection } from '../hooks/useTransactionFiltering'

function getAccountIcon(type: string) {
  if (type === 'credit_card') return <CreditCard size={14} />
  return <Wallet size={14} />
}

function getAccountLabel(type: string) {
  if (type === 'credit_card') return 'Tarjeta'
  return 'Cuenta'
}

interface TransactionTableProps {
  paginatedTransactions: Transaction[]
  selectedTransactionIds: string[]
  allPageSelected: boolean
  somePageSelected: boolean
  isBusy: boolean
  pendingTransactionId: string | null
  sortField: SortField
  sortDirection: SortDirection
  hasActiveFilters: boolean
  onToggleSelect: (id: string, checked: boolean) => void
  onHeaderCheckboxChange: (checked: boolean) => void
  onSort: (field: SortField) => void
  onClearFilters: () => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}

export function TransactionTable({
  paginatedTransactions,
  selectedTransactionIds,
  allPageSelected,
  somePageSelected,
  isBusy,
  pendingTransactionId,
  sortField,
  sortDirection,
  hasActiveFilters,
  onToggleSelect,
  onHeaderCheckboxChange,
  onSort,
  onClearFilters,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  return (
    <Card className="overflow-hidden">
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
                className="text-left px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
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
                  className="flex items-center gap-2 uppercase tracking-[0.05em] hover:text-primary transition-colors"
                >
                  Fecha
                  {sortField === 'date' && <ArrowUpDown size={14} />}
                </button>
              </th>
              <th
                className="text-left px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
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
                  className="flex items-center gap-2 uppercase tracking-[0.05em] hover:text-primary transition-colors"
                >
                  Descripción
                  {sortField === 'description' && <ArrowUpDown size={14} />}
                </button>
              </th>
              <th
                className="text-left px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
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
                  className="flex items-center gap-2 uppercase tracking-[0.05em] hover:text-primary transition-colors"
                >
                  Categoría
                  {sortField === 'category' && <ArrowUpDown size={14} />}
                </button>
              </th>
              <th className="text-left px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                Cuenta
              </th>
              <th className="text-center px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground w-20">
                <span className="inline-flex items-center gap-1">
                  Confianza
                  <Info
                    size={12}
                    className="text-muted-foreground/60"
                    title="Confianza de la categorización automática. Más barras = más seguridad."
                  />
                </span>
              </th>
              <th
                className="text-right px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
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
                  className="flex items-center gap-2 ml-auto uppercase tracking-[0.05em] hover:text-primary transition-colors"
                >
                  Monto
                  {sortField === 'amount' && <ArrowUpDown size={14} />}
                </button>
              </th>
              <th className="text-center px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground w-20">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.length === 0 && hasActiveFilters && (
              <tr>
                <td colSpan={8}>
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
            {paginatedTransactions.map((transaction) =>
              (() => {
                const displayDescription = getDisplayDescription(transaction)
                const hasFriendlyOverride =
                  displayDescription !== transaction.description

                return (
                  <tr
                    key={transaction.id}
                    className={`group border-b border-border hover:bg-muted/30 transition-colors${isCategoryIgnored(transaction.category) ? ' opacity-50' : ''}`}
                  >
                    <td className="px-3.5 py-3 align-middle">
                      <Checkbox
                        aria-label={`Seleccionar ${displayDescription}`}
                        checked={selectedTransactionIds.includes(
                          transaction.id
                        )}
                        onCheckedChange={(checked) =>
                          onToggleSelect(transaction.id, checked === true)
                        }
                        disabled={isBusy}
                      />
                    </td>
                    <td className="px-3.5 py-3 whitespace-nowrap">
                      <div className="text-sm">
                        {formatDate(transaction.date)}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
                      >
                        {(() => {
                          const catId = transaction.category ?? 'uncategorized'
                          const definition = getCategoryDefinition(catId)
                          return (
                            <IconTile
                              aria-hidden="true"
                              size="sm"
                              color={definition.color}
                              style={{ marginTop: 1 }}
                            >
                              {definition.icon ?? (
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: definition.color,
                                    display: 'block',
                                  }}
                                />
                              )}
                            </IconTile>
                          )
                        })()}
                        <div style={{ minWidth: 0 }}>
                          <div
                            className="font-medium truncate"
                            style={{ maxWidth: 220 }}
                          >
                            {displayDescription}
                          </div>
                          {hasFriendlyOverride && (
                            <div
                              className="text-muted-foreground truncate"
                              style={{ fontSize: 11, maxWidth: 220 }}
                            >
                              {transaction.description}
                            </div>
                          )}
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
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <CategoryBadge
                        categoryId={
                          transaction.category || Category.Uncategorized
                        }
                        size="sm"
                      />
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {getAccountIcon(transaction.source)}
                        <span>{getAccountLabel(transaction.source)}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <ConfidenceBadge
                        confidence={transaction.categoryConfidence || 0}
                      />
                    </td>
                    <td className="px-3.5 py-3 text-right whitespace-nowrap">
                      <div
                        className={`font-mono${isCategoryIgnored(transaction.category) ? ' line-through' : ''}`}
                        style={{
                          color:
                            transaction.type === 'credit'
                              ? 'var(--pos)'
                              : 'var(--text)',
                        }}
                      >
                        {transaction.type === 'credit' ? '+' : '-'}
                        {formatCurrency(
                          transaction.amount,
                          transaction.currency
                        )}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity duration-[120ms]">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar ${displayDescription}`}
                          disabled={pendingTransactionId === transaction.id}
                          onClick={() => onEdit(transaction)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Eliminar ${displayDescription}`}
                          disabled={pendingTransactionId === transaction.id}
                          onClick={() => onDelete(transaction)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })()
            )}
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
        {paginatedTransactions.map((transaction) =>
          (() => {
            const displayDescription = getDisplayDescription(transaction)
            const hasFriendlyOverride =
              displayDescription !== transaction.description

            return (
              <div
                key={transaction.id}
                className={`p-4 space-y-3${isCategoryIgnored(transaction.category) ? ' opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Checkbox
                    aria-label={`Seleccionar ${displayDescription}`}
                    checked={selectedTransactionIds.includes(transaction.id)}
                    onCheckedChange={(checked) =>
                      onToggleSelect(transaction.id, checked === true)
                    }
                    disabled={isBusy}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium mb-1 truncate">
                      {displayDescription}
                    </div>
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
                    className={`font-mono${isCategoryIgnored(transaction.category) ? ' line-through' : ''}`}
                    style={{
                      color:
                        transaction.type === 'credit'
                          ? 'var(--pos)'
                          : 'var(--text)',
                    }}
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
                <div className="flex items-center gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${displayDescription}`}
                    disabled={pendingTransactionId === transaction.id}
                    onClick={() => onEdit(transaction)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ${displayDescription}`}
                    className="text-destructive hover:text-destructive"
                    disabled={pendingTransactionId === transaction.id}
                    onClick={() => onDelete(transaction)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            )
          })()
        )}
      </div>
    </Card>
  )
}
