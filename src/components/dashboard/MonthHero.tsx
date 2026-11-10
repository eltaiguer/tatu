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
  // Hogar mode: `monthSummary` is the household cut of the month (its
  // expense is the household expense). The sentence names it, and the
  // income / balance boxes give way to one link to those rows. The caller's
  // `onNavigateToTransactions` already adds the household filter.
  householdMode?: boolean
  // Hogar mode: the month's Sin definir expense, shown under the total as a
  // link to those rows; hidden at zero.
  unassignedExpense?: number
  // Todo mode: how much of the month's expense was household, as a line under
  // the sentence that switches Resumen to Hogar mode; hidden at zero.
  householdExpense?: number
  onShowHousehold?: () => void
}

export function MonthHero({
  monthSummary,
  homeCurrency,
  curWord,
  onNavigateToTransactions,
  householdMode = false,
  unassignedExpense = 0,
  householdExpense = 0,
  onShowHousehold,
}: MonthHeroProps) {
  // Opens exactly the month's rows (optionally only income/expenses).
  const openSummaryMonth =
    onNavigateToTransactions &&
    monthSummary.y !== undefined &&
    monthSummary.m !== undefined
      ? (type?: 'credit' | 'debit', household?: 'unassigned') =>
          onNavigateToTransactions({
            period: {
              mode: 'month',
              y: monthSummary.y as number,
              m: monthSummary.m as number,
            },
            ...(type && { type }),
            ...(household && { household }),
          })
      : undefined

  return (
    <div className="space-y-5">
      <div>
        <h2 className="m-0">
          <span className="block font-sans text-label font-semibold tracking-[0.06em] text-[var(--text-faint)] uppercase">
            {monthSummary.isCurrentMonth
              ? 'Este mes'
              : capitalize(monthSummary.monthLabel)}{' '}
            · todo en {curWord}
          </span>
          <span className="mt-1.5 block font-display text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
            {householdMode ? 'Gastos del hogar' : 'Gastaste'}{' '}
            <span className="font-mono text-[32px] font-medium tracking-[-0.03em] tabular-nums">
              {formatCurrency(monthSummary.expense, homeCurrency)}
            </span>
          </span>
        </h2>
        {!householdMode && householdExpense > 0 && onShowHousehold && (
          <button
            type="button"
            onClick={onShowHousehold}
            className="mt-1.5 -mx-1 block cursor-pointer rounded-md border-none bg-transparent px-1 py-0.5 text-left text-small text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Hogar{' '}
            <span className="font-mono tabular-nums">
              {formatCurrency(householdExpense, homeCurrency)}
            </span>{' '}
            de{' '}
            <span className="font-mono tabular-nums">
              {formatCurrency(monthSummary.expense, homeCurrency)}
            </span>{' '}
            gastados
          </button>
        )}
        {householdMode && unassignedExpense > 0 && (
          <DrillTarget
            onOpen={
              openSummaryMonth &&
              (() => openSummaryMonth('debit', 'unassigned'))
            }
            label="Ver los gastos sin definir del mes"
            className="mt-1.5 -mx-1 px-1 py-0.5"
          >
            <span className="text-small text-muted-foreground">
              Sin definir este mes:{' '}
              <span className="font-mono tabular-nums">
                {formatCurrency(unassignedExpense, homeCurrency)}
              </span>{' '}
              · Categorizalos o marcalos con la casita.
            </span>
          </DrillTarget>
        )}
        <p className="mt-1.5 mb-0 text-small text-[var(--text-faint)]">
          {!monthSummary.isCurrentMonth &&
            'Último mes con movimientos · importá tu extracto más reciente para ver este mes. '}
          Combina tus movimientos en US$ y $U usando el tipo de cambio.
        </p>
      </div>
      {householdMode ? (
        <DrillTarget
          onOpen={openSummaryMonth && (() => openSummaryMonth('debit'))}
          label="Ver los gastos del hogar del mes"
          className="max-w-[720px] px-3 py-2"
        >
          <span className="text-small font-semibold">
            Ver los gastos del hogar del mes →
          </span>
        </DrillTarget>
      ) : (
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
            <div className="text-label text-muted-foreground">
              En cada moneda
            </div>
            <div className="font-mono text-subhead tabular-nums">
              {/* Separate text nodes on purpose: merging them into one run
                shifts the "+" by a pixel (glyph shaping). */}
              {'US$'}{' '}
              {Math.round(monthSummary.split.USD).toLocaleString('es-UY')}
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
      )}
    </div>
  )
}
