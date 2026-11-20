// A nudge row in "¿A dónde se fue la plata?": rows that still need an answer
// ("Sin categoría", in both modes), as one row that opens exactly those rows.
// The counts (expenses and credits) are the rows it opens; the amount is the
// expense part of them (the list's Gastos tile). The caller decides when it
// shows.

import type { Currency, TransactionsFilter } from '../../models'
import { formatCurrency } from '../../utils/formatting'
import { DrillTarget } from './DrillTarget'

// "2 gastos y 1 ingreso": only the non-zero parts, singular when 1.
function countsText(expenses: number, credits: number): string {
  const parts = []
  if (expenses > 0) {
    parts.push(`${expenses} ${expenses === 1 ? 'gasto' : 'gastos'}`)
  }
  if (credits > 0) {
    parts.push(`${credits} ${credits === 1 ? 'ingreso' : 'ingresos'}`)
  }
  return parts.join(' y ')
}

export function SpendNudge({
  title,
  total,
  count,
  incomeCount,
  homeCurrency,
  filter,
  label,
  cta,
  onNavigateToTransactions,
}: {
  title: string
  total: number
  // Expense rows (the ones `total` adds up) and credit rows, counted apart.
  count: number
  incomeCount: number
  homeCurrency: Currency
  // What the row opens: the `count` + `incomeCount` rows.
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
        {count > 0 && (
          <span className="font-mono text-body tabular-nums">
            {formatCurrency(total, homeCurrency)}
          </span>
        )}
        <span className="text-small text-muted-foreground">
          {`${countsText(count, incomeCount)} · todo el historial`}
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
