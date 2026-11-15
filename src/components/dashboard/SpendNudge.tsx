// A nudge row in "¿A dónde se fue la plata?": spend that still needs an
// answer ("Sin categoría" in Todo mode, "Sin definir" in Hogar mode), as one
// row that opens exactly those rows. The caller decides when it shows.

import type { Currency, TransactionsFilter } from '../../models'
import { formatCurrency } from '../../utils/formatting'
import { DrillTarget } from './DrillTarget'

export function SpendNudge({
  title,
  total,
  count,
  homeCurrency,
  filter,
  label,
  cta,
  onNavigateToTransactions,
}: {
  title: string
  total: number
  count: number
  homeCurrency: Currency
  // What the row opens: the rows `total` and `count` add up.
  filter: TransactionsFilter
  // Accessible name of the row.
  label: string
  // The call to action at its end (decorative: the row is the button).
  cta: string
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}) {
  return (
    <DrillTarget
      onOpen={
        onNavigateToTransactions && (() => onNavigateToTransactions(filter))
      }
      label={label}
      className="bg-[var(--accent-soft)] px-4 py-3"
    >
      {/* Inner flex: DrillTarget sets its own display. */}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-body font-semibold">{title}</span>
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
            {cta}
          </span>
        )}
      </span>
    </DrillTarget>
  )
}
