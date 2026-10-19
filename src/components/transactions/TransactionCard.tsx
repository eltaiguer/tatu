import { Scissors, Slash, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { CategoryBadge } from '../CategoryBadge'
import { Category, isSplitParentTx, isSplitChildTx } from '../../models'
import type { Currency } from '../../models'
import { isCategoryIgnored } from '../../services/categories/category-registry'
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
import type { TransactionRowProps } from './TransactionRow'

// One transaction as a mobile card.
export function TransactionCard({
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
  const isSplitParentM = isSplitParentTx(transaction)
  const mutedM = !countsTowardTotals(transaction)
  const isSplitChildM = isSplitChildTx(transaction)

  return (
    <div
      // A split part is indented with a guide line on the left.
      className={`space-y-3 ${
        isSplitChildM
          ? 'border-l-[2px] border-l-[var(--border)] py-4 pr-4 pl-[20px]'
          : 'p-4'
      }${mutedM ? ' text-[color:var(--text-muted)]' : ''}`}
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
            <div className="font-medium truncate">{displayDescription}</div>
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
              mutedM
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
          {homeCurrency && fxRate && transaction.currency !== homeCurrency && (
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
}
