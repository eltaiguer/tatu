// A nudge row in "¿A dónde se fue la plata?": rows that still need an answer
// ("Sin categoría", in both modes), as one row that opens exactly those rows.
// The counts (expenses and credits) are the rows it opens; the amount is the
// expense part of them (the list's Gastos tile). The caller decides when it
// shows.

import { Fragment } from 'react'
import type { Currency, TransactionsFilter } from '../../models'
import { formatCurrency } from '../../utils/formatting'
import { DrillTarget } from './DrillTarget'

// "2 gastos (US$ 30,00) y 1 ingreso": the amount belongs to the expenses
// only; only the non-zero parts, singular when 1.
function countsText(expenses: number, credits: number, amount: string): string {
  const parts = []
  if (expenses > 0) {
    parts.push(`${expenses} ${expenses === 1 ? 'gasto' : 'gastos'} (${amount})`)
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
  const amount = formatCurrency(total, homeCurrency)
  const counts = countsText(count, incomeCount, amount)
  return (
    <DrillTarget
      onOpen={
        onNavigateToTransactions && (() => onNavigateToTransactions(filter))
      }
      // The counts are part of the name: the row's text is hidden by it.
      label={`${label}: ${counts}`}
      className="bg-[var(--accent-soft)] px-4 py-3"
    >
      {/* Inner flex: DrillTarget sets its own display. */}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-body font-semibold">{title}</span>
        <span className="text-small text-muted-foreground">
          {counts.split(amount).map((part, k) => (
            <Fragment key={k}>
              {k > 0 && (
                <span className="font-mono tabular-nums text-body text-[var(--text)]">
                  {amount}
                </span>
              )}
              {part}
            </Fragment>
          ))}
          {' · todo el historial'}
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
