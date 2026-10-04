import {
  ArrowUpDown,
  CreditCard,
  Eye,
  EyeOff,
  Pencil,
  Scissors,
  Search,
  Slash,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react'
import { Button } from './ui/button'
import { EmptyState } from './EmptyState'
import { Card } from './ui/card'
import { IconTile } from './ui/icon-tile'
import { Checkbox } from './ui/checkbox'
import { CategoryBadge } from './CategoryBadge'
import { Category, isSplitParentTx, isSplitChildTx } from '../models'
import type { Transaction } from '../models'
import {
  getCategoryDefinition,
  isCategoryIgnored,
} from '../services/categories/category-registry'
import {
  getDisplayDescription,
  needsCategoryReview,
} from '../utils/transaction-display'
import { formatCurrency, formatDate } from '../utils/formatting'
import { convert } from '../services/currency/convert'
import type { Currency } from '../models'
import type { SortField, SortDirection } from '../hooks/useTransactionFiltering'

function getAccountIcon(type: string) {
  if (type === 'credit_card') return <CreditCard size={14} />
  return <Wallet size={14} />
}

// Which of the three Santander accounts a row came from. A bank account is
// identified by its currency (USD and $U are separate accounts).
export function getAccountLabel(source: string, currency: string): string {
  if (source === 'credit_card') return 'Tarjeta'
  return currency === 'USD' ? 'Cuenta USD' : 'Cuenta $U'
}

// Flags a category worth a second look (none, or a low-confidence automatic
// one). The explanation is in the accessible name, not only a tooltip.
function ReviewMarker() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-[color:var(--accent)] px-1.5 py-px text-caption font-semibold text-[color:var(--text)]"
      title="Categoría sin asignar o asignada automáticamente con poca seguridad"
    >
      Revisar
      <span className="sr-only">
        : categoría sin asignar o asignada automáticamente con poca seguridad
      </span>
    </span>
  )
}

interface TransactionTableProps {
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
  onShowIgnoredChange: (value: boolean) => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onSplit?: (transaction: Transaction) => void
  onUnsplit?: (transaction: Transaction) => void
}

export function TransactionTable({
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
  onShowIgnoredChange,
  onEdit,
  onDelete,
  onSplit,
  onUnsplit,
}: TransactionTableProps) {
  return (
    <Card className="overflow-hidden gap-0">
      {/* Toolbar row: selection count + transfers toggle */}
      <div className="flex items-center justify-between gap-[12px] border-b border-[var(--border)] px-[16px] py-[10px]">
        <span
          className="text-[13px] text-[color:var(--text-muted)]"
          role="status"
          aria-live="polite"
        >
          {selectionCount > 0
            ? `${selectionCount} de ${totalCount} seleccionada${selectionCount !== 1 ? 's' : ''}`
            : `${totalCount} movimiento${totalCount !== 1 ? 's' : ''} en la vista`}
        </span>
        <button
          onClick={() => onShowIgnoredChange(!showIgnored)}
          disabled={ignoredCount === 0}
          title="Las transferencias se ignoran de los totales"
          className={`inline-flex h-[32px] items-center gap-[6px] rounded-[8px] border bg-transparent px-[10px] py-0 text-[13px] font-medium ${
            showIgnored
              ? 'border-[var(--brand)] text-[color:var(--brand-text,var(--brand))]'
              : 'border-[var(--border)] text-[color:var(--text-muted)]'
          } ${
            ignoredCount === 0
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer opacity-100'
          }`}
        >
          {showIgnored ? <Eye size={14} /> : <EyeOff size={14} />}
          {showIgnored ? 'Ocultar' : 'Mostrar'} transferencias ignoradas
          {ignoredCount > 0 && (
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-[color:var(--text-muted)]">
              · {ignoredCount}
            </span>
          )}
        </button>
      </div>

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
            {paginatedTransactions.map((transaction) =>
              (() => {
                const displayDescription = getDisplayDescription(transaction)
                const hasFriendlyOverride =
                  displayDescription !== transaction.description
                const isIgnored = isCategoryIgnored(transaction.category)
                const isSplitParent = isSplitParentTx(transaction)
                const isSplitChild = isSplitChildTx(transaction)
                const showConverted =
                  homeCurrency &&
                  fxRate &&
                  transaction.currency !== homeCurrency
                const convertedAmount = showConverted
                  ? convert(
                      transaction.amount,
                      transaction.currency as Currency,
                      homeCurrency as Currency,
                      fxRate
                    )
                  : null

                return (
                  <tr
                    key={transaction.id}
                    // Ignored and split-parent rows read as secondary through
                    // muted text, not opacity, so their pills keep AA contrast.
                    className={`group border-b border-border hover:bg-muted/30 transition-colors${
                      isIgnored || isSplitParent ? ' text-muted-foreground' : ''
                    }`}
                  >
                    <td className="px-3.5 py-1.5 align-middle">
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
                    <td className="px-3.5 py-1.5 whitespace-nowrap">
                      <div className="text-sm">
                        {formatDate(transaction.date)}
                      </div>
                    </td>
                    <td
                      className="px-3.5 py-1.5"
                      style={
                        isSplitChild
                          ? {
                              borderLeft: '2px solid var(--border)',
                              paddingLeft: 20,
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-start gap-[10px]">
                        {(() => {
                          const catId = transaction.category ?? 'uncategorized'
                          const definition = getCategoryDefinition(catId)
                          return (
                            <IconTile
                              aria-hidden="true"
                              size="sm"
                              color={definition.color}
                              className="mt-[1px]"
                            >
                              {definition.icon ?? (
                                <span
                                  className="block h-[8px] w-[8px] rounded-full"
                                  style={{ background: definition.color }}
                                />
                              )}
                            </IconTile>
                          )
                        })()}
                        <div className="min-w-0">
                          <div className="flex items-center gap-[7px]">
                            <div className="font-medium truncate leading-snug max-w-[220px]">
                              {displayDescription}
                            </div>
                            {isIgnored && (
                              <span className="inline-flex shrink-0 items-center gap-[3px] rounded-[4px] bg-[var(--muted)] px-[6px] py-[1px] text-[11px] font-medium text-[color:var(--text-muted)]">
                                <Slash size={9} />
                                Ignorada
                              </span>
                            )}
                            {isSplitParent && (
                              <span className="inline-flex shrink-0 items-center gap-[3px] rounded-[4px] bg-[var(--muted)] px-[6px] py-[1px] text-[11px] font-medium text-[color:var(--text-muted)]">
                                <Scissors size={9} />
                                Dividida
                              </span>
                            )}
                          </div>
                          {hasFriendlyOverride && (
                            <div className="text-muted-foreground truncate leading-tight text-[11px] max-w-[220px]">
                              {transaction.description}
                            </div>
                          )}
                          {(transaction.tags ?? []).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
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
                    <td className="px-3.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <CategoryBadge
                          categoryId={
                            transaction.category || Category.Uncategorized
                          }
                          size="sm"
                        />
                        {needsCategoryReview(transaction) && <ReviewMarker />}
                      </div>
                    </td>
                    <td className="px-3.5 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {getAccountIcon(transaction.source)}
                        <span>
                          {getAccountLabel(
                            transaction.source,
                            transaction.currency
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-3.5 py-1.5 text-right whitespace-nowrap">
                      <div
                        className={`font-mono leading-snug${isIgnored ? ' line-through' : ''} ${
                          isIgnored || isSplitParent
                            ? 'text-[color:var(--text-muted)]'
                            : transaction.type === 'credit'
                              ? 'text-[color:var(--pos)]'
                              : 'text-[color:var(--text)]'
                        }`}
                      >
                        {transaction.type === 'credit' ? '+' : '-'}
                        {formatCurrency(
                          transaction.amount,
                          transaction.currency as Currency
                        )}
                      </div>
                      {convertedAmount !== null && (
                        <div className="font-mono leading-tight mt-[1px] text-[11px] text-[color:var(--text-muted)]">
                          ≈{' '}
                          {formatCurrency(
                            convertedAmount,
                            homeCurrency as Currency
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-100 transition-opacity duration-[120ms] [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
                        {isSplitParent && onUnsplit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={`Restaurar ${displayDescription}`}
                            disabled={pendingTransactionIds.has(transaction.id)}
                            onClick={() => onUnsplit(transaction)}
                            title="Restaurar (quitar división)"
                          >
                            <Undo2 size={14} />
                          </Button>
                        )}
                        {!isSplitParent && !isSplitChild && onSplit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={`Dividir ${displayDescription}`}
                            disabled={pendingTransactionIds.has(transaction.id)}
                            onClick={() => onSplit(transaction)}
                            title="Dividir transacción"
                          >
                            <Scissors size={14} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={`Editar ${displayDescription}`}
                          disabled={pendingTransactionIds.has(transaction.id)}
                          onClick={() => onEdit(transaction)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          aria-label={`Eliminar ${displayDescription}`}
                          disabled={pendingTransactionIds.has(transaction.id)}
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
            const isIgnored = isCategoryIgnored(transaction.category)
            const isSplitParentM = isSplitParentTx(transaction)
            const isSplitChildM = isSplitChildTx(transaction)

            return (
              <div
                key={transaction.id}
                // A split part is indented with a guide line on the left.
                className={`space-y-3 ${
                  isSplitChildM
                    ? 'border-l-[2px] border-l-[var(--border)] py-4 pr-4 pl-[20px]'
                    : 'p-4'
                }${
                  isIgnored || isSplitParentM
                    ? ' text-[color:var(--text-muted)]'
                    : ''
                }`}
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
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-medium truncate">
                        {displayDescription}
                      </div>
                      {isIgnored && (
                        <span className="inline-flex shrink-0 items-center gap-[3px] rounded-[4px] bg-[var(--muted)] px-[6px] py-[1px] text-[11px] font-medium text-[color:var(--text-muted)]">
                          <Slash size={9} />
                          Ignorada
                        </span>
                      )}
                      {isSplitParentM && (
                        <span className="inline-flex shrink-0 items-center gap-[3px] rounded-[4px] bg-[var(--muted)] px-[6px] py-[1px] text-[11px] font-medium text-[color:var(--text-muted)]">
                          <Scissors size={9} />
                          Dividida
                        </span>
                      )}
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
                  <div className="text-right">
                    <div
                      className={`font-mono${isIgnored ? ' line-through' : ''} ${
                        isIgnored || isSplitParentM
                          ? 'text-[color:var(--text-muted)]'
                          : transaction.type === 'credit'
                            ? 'text-[color:var(--pos)]'
                            : 'text-[color:var(--text)]'
                      }`}
                    >
                      {transaction.type === 'credit' ? '+' : '-'}
                      {formatCurrency(
                        transaction.amount,
                        transaction.currency as Currency
                      )}
                    </div>
                    {homeCurrency &&
                      fxRate &&
                      transaction.currency !== homeCurrency && (
                        <div className="font-mono mt-[1px] text-[11px] text-[color:var(--text-muted)]">
                          ≈{' '}
                          {formatCurrency(
                            convert(
                              transaction.amount,
                              transaction.currency as Currency,
                              homeCurrency as Currency,
                              fxRate
                            ),
                            homeCurrency as Currency
                          )}
                        </div>
                      )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <CategoryBadge
                    categoryId={transaction.category || Category.Uncategorized}
                    size="sm"
                  />
                  {needsCategoryReview(transaction) && <ReviewMarker />}
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
                    {getAccountLabel(transaction.source, transaction.currency)}
                  </span>
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {isSplitParentM && onUnsplit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Restaurar ${displayDescription}`}
                      disabled={pendingTransactionIds.has(transaction.id)}
                      onClick={() => onUnsplit(transaction)}
                    >
                      <Undo2 size={16} />
                    </Button>
                  )}
                  {!isSplitParentM && !isSplitChildM && onSplit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Dividir ${displayDescription}`}
                      disabled={pendingTransactionIds.has(transaction.id)}
                      onClick={() => onSplit(transaction)}
                    >
                      <Scissors size={16} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${displayDescription}`}
                    disabled={pendingTransactionIds.has(transaction.id)}
                    onClick={() => onEdit(transaction)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ${displayDescription}`}
                    className="text-destructive hover:text-destructive"
                    disabled={pendingTransactionIds.has(transaction.id)}
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
