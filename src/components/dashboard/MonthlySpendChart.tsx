// Gasto por mes — one bar per month with data (spend), income as a lighter
// bar behind it. Bars, not a curve: months without data are not drawn
// between. Each bar opens its month's expenses; the income bar its income.

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import type { Currency } from '../../models'
import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'
import { formatCurrency, formatCurrencyShort } from '../../utils/formatting'
import { averageSpendOfMonthsWithSpend } from '../../services/charts/chart-data'
import {
  HOUSEHOLD_GHOST_CAPTION,
  householdShareLine,
} from '../../services/household/household-copy'
import { Card } from '../ui/card'
import { MonthButtons } from './MonthButtons'
import { MonthlySpendTooltip } from './MonthlySpendTooltip'

interface MonthlySpendChartProps {
  monthlyTrend: MonthlyTrendRow[]
  homeCurrency: Currency
  // Opens one month's rows; undefined when there is nowhere to navigate.
  openMonth?: (key: string, type?: 'credit' | 'debit') => void
  // The lighter bar behind each month: the income (Todo) or, in Hogar mode,
  // where income is out of scope, the Todo spend the household bar is part of.
  ghost?: 'income' | 'total'
}

export function MonthlySpendChart({
  monthlyTrend,
  homeCurrency,
  openMonth,
  ghost = 'income',
}: MonthlySpendChartProps) {
  const showIncome = ghost === 'income'
  // Partial months are drawn but not averaged: ten days of a statement
  // would read as a cheap month.
  const avgMonthly = averageSpendOfMonthsWithSpend(
    monthlyTrend.filter((m) => m.complete).map((m) => m.gastos)
  )

  // A Hogar month with no household spend would open an empty list, so it has
  // no drill (bar or button). Todo keeps every month's.
  const opensExpenses = (m: { gastos: number }) => showIncome || m.gastos > 0
  // Hogar only: how much of each month's Todo spend the household bar is,
  // computed once per month.
  const shares = new Map(
    monthlyTrend.map((m) => [
      m.key,
      showIncome
        ? null
        : householdShareLine(m.gastos, m.todoGastos, homeCurrency),
    ])
  )
  const shareSuffix = (m: MonthlyTrendRow) =>
    shares.get(m.key) ? ` · ${shares.get(m.key)}` : ''
  // A Hogar month without a drill still says its share, for keyboard and
  // screen reader users (the tooltip is mouse-only).
  const undrilled = showIncome
    ? []
    : monthlyTrend.filter((m) => !opensExpenses(m) && shares.get(m.key))

  const tooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null
    return (
      <MonthlySpendTooltip
        month={payload[0].payload as MonthlyTrendRow}
        label={String(label)}
        homeCurrency={homeCurrency}
        ghost={ghost}
      />
    )
  }

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-title font-semibold">Gasto por mes</h3>
          <p className="mx-0 mt-[2px] mb-0 text-caption text-[var(--text-faint)]">
            {showIncome
              ? 'La barra más clara detrás de cada mes son tus ingresos'
              : HOUSEHOLD_GHOST_CAPTION}
          </p>
        </div>
        {showIncome && avgMonthly !== null && (
          <div className="sm:text-right">
            <div className="text-label text-muted-foreground">
              Promedio por mes completo con gastos
            </div>
            <div className="font-mono text-subhead tabular-nums">
              {formatCurrency(avgMonthly, homeCurrency)}
            </div>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={monthlyTrend}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            stroke="var(--text-faint)"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          {/* A second, hidden axis over the same months: each bar gets its
              own band, so income sits behind spend at any width. */}
          <XAxis dataKey="month" xAxisId="ghost" hide />
          <YAxis
            stroke="var(--text-faint)"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrencyShort(v, homeCurrency)}
            width={72}
          />
          <Tooltip
            content={tooltip}
            cursor={{ fill: 'var(--surface-2)', opacity: 0.6 }}
          />
          {showIncome && (
            <Bar
              dataKey="ingresos"
              xAxisId="ghost"
              fill="var(--pos)"
              fillOpacity={0.2}
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
              cursor={openMonth ? 'pointer' : undefined}
              onClick={(row: { key?: string }) =>
                row.key && openMonth?.(row.key, 'credit')
              }
            >
              {monthlyTrend.map((m) => (
                <Cell key={m.key} fillOpacity={m.complete ? 0.2 : 0.1} />
              ))}
            </Bar>
          )}
          {!showIncome && (
            // No drill: the Hogar drill would open rows that do not sum to it.
            <Bar
              dataKey="todoGastos"
              xAxisId="ghost"
              fill="var(--neg)"
              fillOpacity={0.2}
              radius={[3, 3, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            >
              {monthlyTrend.map((m) => (
                <Cell key={m.key} fillOpacity={m.complete ? 0.2 : 0.1} />
              ))}
            </Bar>
          )}
          <Bar
            dataKey="gastos"
            fill="var(--neg)"
            fillOpacity={0.78}
            radius={[3, 3, 0, 0]}
            maxBarSize={14}
            isAnimationActive={false}
            cursor={openMonth ? 'pointer' : undefined}
            onClick={(row: { key?: string; gastos?: number }) =>
              row.key &&
              opensExpenses({ gastos: row.gastos ?? 0 }) &&
              openMonth?.(row.key, 'debit')
            }
          >
            {monthlyTrend.map((m) => (
              <Cell key={m.key} fillOpacity={m.complete ? 0.78 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {openMonth && (
        <MonthButtons
          label={showIncome ? 'Gastos e ingresos por mes' : 'Gastos por mes'}
          buttons={monthlyTrend.flatMap((m) => [
            ...(opensExpenses(m)
              ? [
                  {
                    key: `${m.key}-debit`,
                    text: `Ver los gastos de ${m.month}${m.complete ? '' : ' (mes incompleto)'}${shareSuffix(m)}`,
                    onClick: () => openMonth(m.key, 'debit'),
                  },
                ]
              : []),
            ...(showIncome
              ? [
                  {
                    key: `${m.key}-credit`,
                    text: `Ver los ingresos de ${m.month}${m.complete ? '' : ' (mes incompleto)'}`,
                    onClick: () => openMonth(m.key, 'credit'),
                  },
                ]
              : []),
          ])}
        />
      )}
      {undrilled.length > 0 && (
        <ul aria-label="Meses sin gastos del hogar" className="sr-only">
          {undrilled.map((m) => (
            <li key={m.key}>
              {m.month} · {shares.get(m.key)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
