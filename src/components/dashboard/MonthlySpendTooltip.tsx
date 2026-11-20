// The hover body of "Gasto por mes": the month's spend and, in Hogar mode, the
// household's share of the Todo spend (the lighter bar). Amounts in the mono
// face.

import type { Currency } from '../../models'
import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'
import {
  HOUSEHOLD_PARTIAL_MONTH_NOTE,
  householdShareParts,
} from '../../services/household/household-copy'
import { formatCurrency } from '../../utils/formatting'

export function MonthlySpendTooltip({
  month: d,
  label,
  homeCurrency,
  ghost,
}: {
  month: MonthlyTrendRow
  label: string
  homeCurrency: Currency
  ghost: 'income' | 'total'
}) {
  const showIncome = ghost === 'income'
  const share = showIncome
    ? null
    : householdShareParts(d.gastos, d.todoGastos, homeCurrency)
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[14px] py-[10px] shadow-[var(--shadow-md)]">
      <p className="mx-0 mt-0 mb-[6px] text-[12px] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="mx-0 my-[3px] text-[12px] font-semibold">
        {showIncome ? 'Gastos' : 'Gastos del hogar'}:{' '}
        <span className="font-mono tabular-nums">
          {formatCurrency(d.gastos, homeCurrency)}
        </span>
      </p>
      {share && (
        <p className="mx-0 my-[3px] text-[12px] text-[var(--text-faint)]">
          {share.lead}{' '}
          <span className="font-mono tabular-nums">{share.total}</span>
        </p>
      )}
      {showIncome && (
        <p className="mx-0 my-[3px] text-[12px] text-[var(--pos)]">
          Ingresos:{' '}
          <span className="font-mono tabular-nums">
            {formatCurrency(d.ingresos, homeCurrency)}
          </span>
        </p>
      )}
      {!d.complete && (
        <p className="mx-0 mt-[6px] mb-0 text-[12px] text-[var(--text-faint)]">
          {showIncome
            ? 'Le faltan datos de alguna cuenta: no entra en el promedio'
            : HOUSEHOLD_PARTIAL_MONTH_NOTE}
        </p>
      )}
    </div>
  )
}
