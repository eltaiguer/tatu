// "Sin definir" banner (Hogar mode): spend whose household answer is still
// open (uncategorized rows with no choice of their own). It stands where the
// "Sin categoría" nudge does in Todo mode and opens exactly those rows.

import type { Currency, TransactionsFilter } from '../../models'
import { formatCurrency } from '../../utils/formatting'
import { DrillTarget } from './DrillTarget'

export function UnassignedNudge({
  total,
  count,
  homeCurrency,
  onNavigateToTransactions,
}: {
  total: number
  count: number
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}) {
  if (count === 0) return null
  return (
    <DrillTarget
      onOpen={
        onNavigateToTransactions &&
        (() =>
          onNavigateToTransactions({ type: 'debit', household: 'unassigned' }))
      }
      label="Ver los gastos sin definir"
      className="bg-[var(--accent-soft)] px-4 py-3"
    >
      {/* Inner flex: DrillTarget sets its own display. */}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-body font-semibold">Sin definir</span>
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
            Categorizalos o marcalos →
          </span>
        )}
      </span>
    </DrillTarget>
  )
}
