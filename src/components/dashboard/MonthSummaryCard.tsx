// "Este mes" panel — converted + combined totals in home currency.

import type { Currency, TransactionsFilter } from '../../models'
import type { MonthSummary } from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'
import { Card } from '../ui/card'
import { DrillTarget } from './DrillTarget'

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface MonthSummaryCardProps {
  monthSummary: MonthSummary
  homeCurrency: Currency
  curWord: string
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function MonthSummaryCard({
  monthSummary,
  homeCurrency,
  curWord,
  onNavigateToTransactions,
}: MonthSummaryCardProps) {
  // Opens exactly the month card's rows (optionally only income/expenses).
  const openSummaryMonth =
    onNavigateToTransactions &&
    monthSummary.y !== undefined &&
    monthSummary.m !== undefined
      ? (type?: 'credit' | 'debit') =>
          onNavigateToTransactions({
            period: {
              mode: 'month',
              y: monthSummary.y as number,
              m: monthSummary.m as number,
            },
            ...(type && { type }),
          })
      : undefined

  return (
    <Card className="p-6">
      <div className="mb-[20px]">
        <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
          {monthSummary.isCurrentMonth
            ? 'Este mes'
            : capitalize(monthSummary.monthLabel)}
          , todo en {curWord}
        </h2>
        <p className="mt-[4px] mb-0 text-[12px] text-[var(--text-faint)]">
          {!monthSummary.isCurrentMonth &&
            'Último mes con movimientos · importá tu extracto más reciente para ver este mes. '}
          Combina tus movimientos en US$ y $U usando el tipo de cambio.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <DrillTarget
          onOpen={openSummaryMonth && (() => openSummaryMonth('credit'))}
          label="Ver los ingresos del mes"
        >
          <div className="mb-[4px] text-[12px] font-medium text-muted-foreground">
            Ingresos
          </div>
          <div className="font-mono text-[22px] text-[var(--pos)]">
            {formatCurrency(monthSummary.income, homeCurrency)}
          </div>
        </DrillTarget>
        <DrillTarget
          onOpen={openSummaryMonth && (() => openSummaryMonth('debit'))}
          label="Ver los gastos del mes"
        >
          <div className="mb-[4px] text-[12px] font-medium text-muted-foreground">
            Gastos
          </div>
          <div className="font-mono text-[22px] text-[var(--text)]">
            {formatCurrency(monthSummary.expense, homeCurrency)}
          </div>
          <div className="font-mono mt-[8px] text-[11px] text-[var(--text-faint)]">
            {/* Separate text nodes on purpose: merging them into one run
                shifts the "+" by a pixel (glyph shaping). */}
            {'US$'} {Math.round(monthSummary.split.USD).toLocaleString('es-UY')}
            {' + $U'}{' '}
            {Math.round(monthSummary.split.UYU).toLocaleString('es-UY')}
          </div>
        </DrillTarget>
        <DrillTarget
          onOpen={openSummaryMonth && (() => openSummaryMonth())}
          label="Ver los movimientos del mes"
        >
          <div className="mb-[4px] text-[12px] font-medium text-muted-foreground">
            Balance neto
          </div>
          <div
            className="font-mono text-[22px]"
            style={{
              color: monthSummary.net >= 0 ? 'var(--pos)' : 'var(--neg)',
            }}
          >
            {monthSummary.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(monthSummary.net), homeCurrency)}
          </div>
          <div className="mt-[8px] text-[12px] text-muted-foreground">
            {monthSummary.count} transacciones registradas
          </div>
        </DrillTarget>
      </div>
    </Card>
  )
}
