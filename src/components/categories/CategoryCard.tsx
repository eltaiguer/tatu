import { Pencil, Trash } from 'lucide-react'
import type { Currency, TransactionsFilter } from '../../models'
import { Category } from '../../models'
import type { CategoryDefinition } from '../../services/categories/category-registry'
import { normalizeCategoryId } from '../../services/categories/category-aliases'
import type { CategorySpendingDatum } from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'

// A defined category, or an orphan: a category whose definition was deleted
// but that transactions still carry (shown without edit/delete).
export type CategoryCardData = CategoryDefinition & { isOrphan: boolean }

interface CategoryCardProps {
  cat: CategoryCardData
  count: number
  spend: CategorySpendingDatum | undefined
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  onEdit: (categoryId: string) => void
  onDelete: (categoryId: string) => void
}

export function CategoryCard({
  cat,
  count,
  spend,
  homeCurrency,
  onNavigateToTransactions,
  onEdit,
  onDelete,
}: CategoryCardProps) {
  return (
    <div className="relative flex items-center gap-[10px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-[14px] py-[12px]">
      {/* Icon tile */}
      <span
        className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[10px] text-[18px]"
        style={{ background: cat.color + '22' }}
      >
        {cat.icon}
      </span>

      {/* Name + count */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[6px] overflow-hidden text-ellipsis text-[13px] font-semibold text-[var(--text)]">
          {cat.label}
          {cat.isOrphan && (
            <span
              title="Categoría eliminada que todavía tiene transacciones"
              className="shrink-0 rounded-[4px] bg-[var(--border)] px-[5px] py-[1px] text-[10px] font-medium text-[var(--text-faint)]"
            >
              sin definir
            </span>
          )}
          {cat.isIgnored && (
            <span className="shrink-0 rounded-[4px] bg-[var(--border)] px-[5px] py-[1px] text-[10px] font-medium text-[var(--text-faint)]">
              ignorada
            </span>
          )}
        </div>
        <div className="mt-[1px] text-[11px] text-[var(--text-faint)]">
          {spend && spend.total > 0 ? (
            onNavigateToTransactions ? (
              <button
                type="button"
                onClick={() =>
                  onNavigateToTransactions({
                    categories: [normalizeCategoryId(cat.id)],
                    type: 'debit',
                  })
                }
                aria-label={`Ver los gastos en ${cat.label}`}
                className="font-mono text-[12px] font-medium text-[color:var(--text)] underline-offset-2 hover:underline"
              >
                {formatCurrency(spend.total, homeCurrency)} · {spend.count}{' '}
                {spend.count === 1 ? 'gasto' : 'gastos'}
              </button>
            ) : (
              <span className="font-mono text-[12px] text-[color:var(--text)]">
                {formatCurrency(spend.total, homeCurrency)} · {spend.count}{' '}
                {spend.count === 1 ? 'gasto' : 'gastos'}
              </span>
            )
          ) : (
            <>
              {count} {count === 1 ? 'movimiento' : 'movimientos'}
              {!cat.isIgnored && count > 0 && ' · sin gastos'}
            </>
          )}
          {cat.id === Category.Uncategorized &&
            count > 0 &&
            onNavigateToTransactions && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToTransactions({
                      categories: [Category.Uncategorized],
                    })
                  }
                  className="text-[11px] font-medium text-[color:var(--brand-text)] underline-offset-2 hover:underline"
                >
                  Revisar {count}
                </button>
              </>
            )}
        </div>
      </div>

      {/* Edit (all) / delete (custom only) */}
      <div className={cat.isOrphan ? 'hidden gap-[4px]' : 'flex gap-[4px]'}>
        <button
          onClick={() => onEdit(cat.id)}
          aria-label={`Editar categoría ${cat.label}`}
          className="grid cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--text-faint)]"
        >
          <Pencil size={13} />
        </button>
        {cat.isCustom && (
          <button
            onClick={() => onDelete(cat.id)}
            aria-label={`Eliminar categoría ${cat.label}`}
            className="grid cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--neg)]"
          >
            <Trash size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
