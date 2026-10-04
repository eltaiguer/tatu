import { Scissors, Slash, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { IconTile } from '../ui/icon-tile'
import { CategoryBadge } from '../CategoryBadge'
import { Category, isSplitParentTx, isSplitChildTx } from '../../models'
import type { Currency, Transaction } from '../../models'
import {
  getCategoryDefinition,
  isCategoryIgnored,
} from '../../services/categories/category-registry'
import {
  getDisplayDescription,
  needsCategoryReview,
} from '../../utils/transaction-display'
import { formatCurrency, formatDate } from '../../utils/formatting'
import { convert } from '../../services/currency/convert'
import { countsTowardTotals } from '../../services/spending/spending-rules'
import {
  getAccountIcon,
  getAccountLabel,
  ReviewMarker,
} from './transaction-row-parts'

export interface TransactionRowProps {
  transaction: Transaction
  selectedTransactionIds: string[]
  isBusy: boolean
  pendingTransactionIds: ReadonlySet<string>
  homeCurrency?: string
  fxRate?: number
  onToggleSelect: (id: string, checked: boolean) => void
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onSplit?: (transaction: Transaction) => void
  onUnsplit?: (transaction: Transaction) => void
}

// One transaction as a desktop table row.
export function TransactionRow({
  transaction,
  selectedTransactionIds,
  isBusy,
  pendingTransactionIds,
  homeCurrency,
  fxRate,
  onToggleSelect,
  onEdit,
  onDelete,
  onSplit,
  onUnsplit,
}: TransactionRowProps) {
  const displayDescription = getDisplayDescription(transaction)
  const hasFriendlyOverride = displayDescription !== transaction.description
  const isIgnored = isCategoryIgnored(transaction.category)
  const isSplitParent = isSplitParentTx(transaction)
  // Muted when the row adds nothing to the totals.
  const muted = !countsTowardTotals(transaction)
  const isSplitChild = isSplitChildTx(transaction)
  const showConverted =
    homeCurrency && fxRate && transaction.currency !== homeCurrency
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
      // Ignored and split-parent rows read as secondary through
      // muted text, not opacity, so their pills keep AA contrast.
      className={`group border-b border-border hover:bg-muted/30 transition-colors${
        muted ? ' text-muted-foreground' : ''
      }`}
    >
      <td className="px-3.5 py-1.5 align-middle">
        <Checkbox
          aria-label={`Seleccionar ${displayDescription}`}
          checked={selectedTransactionIds.includes(transaction.id)}
          onCheckedChange={(checked) =>
            onToggleSelect(transaction.id, checked === true)
          }
          disabled={isBusy}
        />
      </td>
      <td className="px-3.5 py-1.5 whitespace-nowrap">
        <div className="text-sm">{formatDate(transaction.date)}</div>
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
            categoryId={transaction.category || Category.Uncategorized}
            size="sm"
          />
          {needsCategoryReview(transaction) && <ReviewMarker />}
        </div>
      </td>
      <td className="px-3.5 py-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {getAccountIcon(transaction.source)}
          <span>
            {getAccountLabel(transaction.source, transaction.currency)}
          </span>
        </div>
      </td>
      <td className="px-3.5 py-1.5 text-right whitespace-nowrap">
        <div
          className={`font-mono leading-snug${isIgnored ? ' line-through' : ''} ${
            muted
              ? 'text-[color:var(--text-muted)]'
              : transaction.type === 'credit'
                ? 'text-[color:var(--pos)]'
                : 'text-[color:var(--text)]'
          }`}
        >
          {transaction.type === 'credit' ? '+' : '-'}
          {formatCurrency(transaction.amount, transaction.currency as Currency)}
        </div>
        {convertedAmount !== null && (
          <div className="font-mono leading-tight mt-[1px] text-[11px] text-[color:var(--text-muted)]">
            {/* Separate text nodes, as before the move: "≈", " ", amount. */}
            {'≈'} {formatCurrency(convertedAmount, homeCurrency as Currency)}
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
}
