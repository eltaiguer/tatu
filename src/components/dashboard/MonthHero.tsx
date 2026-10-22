// Resumen's hero: the month's spend as one sentence, converted + combined in
// the home currency, with income, the currency split and the balance under it.

import type { Currency, TransactionsFilter } from '../../models'
import type { MonthSummary } from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'
import { DrillTarget } from './DrillTarget'

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface MonthHeroProps {
  monthSummary: MonthSummary
  homeCurrency: Currency
  curWord: string
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function MonthHero({
  monthSummary,
  homeCurrency,
  curWord,
  onNavigateToTransactions,
}: MonthHeroProps) {
  // Opens exactly the month's rows (optionally only income/expenses).
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
    <div className="space-y-5">
      <div>
        <p className="m-0 text-label font-semibold tracking-[0.06em] text-[var(--text-faint)] uppercase">
          {monthSummary.isCurrentMonth
            ? 'Este mes'
            : capitalize(monthSummary.monthLabel)}{' '}
          · todo en {curWord}
        </p>
        <h2 className="mt-1.5 mb-0 font-display text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
          Gastaste{' '}
          <span className="font-mono text-[32px] font-medium tracking-[-0.03em] tabular-nums">
            {formatCurrency(monthSummary.expense, homeCurrency)}
          </span>
        </h2>
        <p className="mt-1.5 mb-0 text-small text-[var(--text-faint)]">
          {!monthSummary.isCurrentMonth &&
            'Último mes con movimientos · importá tu extracto más reciente para ver este mes. '}
          Combina tus movimientos en US$ y $U usando el tipo de cambio.
        </p>
      </div>
      <div className="grid max-w-[720px] grid-cols-1 gap-2 sm:grid-cols-3">
        <DrillTarget
          onOpen={openSummaryMonth && (() => openSummaryMonth('credit'))}
          label="Ver los ingresos del mes"
          className="px-3 py-2"
        >
          <div className="text-label text-muted-foreground">Ingresos</div>
          <div className="font-mono text-subhead text-[var(--pos)] tabular-nums">
            {formatCurrency(monthSummary.income, homeCurrency)}
          </div>
        </DrillTarget>
        <DrillTarget
          onOpen={openSummaryMonth && (() => openSummaryMonth('debit'))}
          label="Ver los gastos del mes"
          className="px-3 py-2"
        >
          <div className="text-label text-muted-foreground">En cada moneda</div>
          <div className="font-mono text-subhead tabular-nums">
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
          className="px-3 py-2"
        >
          <div className="text-label text-muted-foreground">Balance neto</div>
          <div
            className="font-mono text-subhead tabular-nums"
            style={{
              color: monthSummary.net >= 0 ? 'var(--pos)' : 'var(--neg)',
            }}
          >
            {monthSummary.net >= 0 ? '+' : '−'}
            {formatCurrency(Math.abs(monthSummary.net), homeCurrency)}
          </div>
          <div className="text-caption text-[var(--text-faint)]">
            {monthSummary.count} transacciones registradas
          </div>
        </DrillTarget>
      </div>
    </div>
  )
}
