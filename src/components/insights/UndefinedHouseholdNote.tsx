// Hogar mode of Insights leaves the Sin definir rows out of the analysis
// (ADR-0005: household figures are never built on guesses). This line, written
// by the app and not by Claude, says how much was left out and opens it.

import type { Currency, TransactionsFilter } from '../../models'
import { formatCurrency } from '../../utils/formatting'

export function UndefinedHouseholdNote({
  total,
  count,
  homeCurrency,
  onNavigateToTransactions,
}: {
  total: number
  count: number
  homeCurrency: Currency
  onNavigateToTransactions: (filter: TransactionsFilter) => void
}) {
  const amount = formatCurrency(total, homeCurrency)
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-small text-muted-foreground">
      <span>
        {count === 1
          ? `1 gasto sin definir (${amount}) no entra en este análisis`
          : `${count} gastos sin definir (${amount}) no entran en este análisis`}
      </span>
      <button
        type="button"
        onClick={() =>
          onNavigateToTransactions({ type: 'debit', household: 'unassigned' })
        }
        className="cursor-pointer border-none bg-transparent p-0 text-small font-semibold text-[var(--brand-text)]"
      >
        Verlos →
      </button>
    </p>
  )
}
