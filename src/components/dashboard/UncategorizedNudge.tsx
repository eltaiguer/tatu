// "Sin categoría" nudge: spend no category explains yet, as one row that
// opens exactly those rows. Hidden when everything is categorized.

import type { Currency, TransactionsFilter } from '../../models'
import { Category } from '../../models'
import type { CategorySpendingDatum } from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'
import { DrillTarget } from './DrillTarget'

export function UncategorizedNudge({
  uncategorizedSpend,
  homeCurrency,
  onNavigateToTransactions,
}: {
  uncategorizedSpend: CategorySpendingDatum | undefined
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}) {
  if (!uncategorizedSpend) return null
  const { count, total } = uncategorizedSpend
  return (
    <DrillTarget
      onOpen={
        onNavigateToTransactions &&
        (() =>
          onNavigateToTransactions({
            categories: [Category.Uncategorized],
            type: 'debit',
          }))
      }
      label="Ver los gastos sin categoría"
      className="bg-[var(--accent-soft)] px-4 py-3"
    >
      {/* Inner flex: DrillTarget sets its own display. */}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-body font-semibold">Sin categoría</span>
        <span className="font-mono text-body tabular-nums">
          {formatCurrency(total, homeCurrency)}
        </span>
        <span className="text-small text-muted-foreground">
          {`${count} ${count === 1 ? 'gasto' : 'gastos'} · todo el historial`}
        </span>
        {onNavigateToTransactions && (
          <span
            aria-hidden="true"
            className="ml-auto text-small font-semibold text-[var(--text)]"
          >
            Categorizalos →
          </span>
        )}
      </span>
    </DrillTarget>
  )
}
