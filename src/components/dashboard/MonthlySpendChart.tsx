// Gasto por mes — one bar per month with data (spend), income as a ghost bar
// behind it. Bars, not a curve: months without data are not drawn between.

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
import { Card } from '../ui/card'

interface MonthlySpendChartProps {
  monthlyTrend: MonthlyTrendRow[]
  homeCurrency: Currency
  // Opens one month's rows; undefined when there is nowhere to navigate.
  openMonth?: (key: string, type?: 'credit' | 'debit') => void
}

export function MonthlySpendChart({
  monthlyTrend,
  homeCurrency,
  openMonth,
}: MonthlySpendChartProps) {
  // Averaged over the months that have data, like every Resumen trend.
  const avgMonthly =
    monthlyTrend.length > 0
      ? Math.round(
          monthlyTrend.reduce((s, m) => s + m.gastos, 0) / monthlyTrend.length
        )
      : 0

  const tooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload as MonthlyTrendRow
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[14px] py-[10px] shadow-[var(--shadow-md)]">
        <p className="mx-0 mt-0 mb-[6px] text-[12px] text-[var(--text-faint)]">
          {label}
        </p>
        <p className="mx-0 my-[3px] text-[12px] font-semibold">
          Gastos:{' '}
          <span className="font-mono">
            {formatCurrency(d.gastos, homeCurrency)}
          </span>
        </p>
        <p className="mx-0 my-[3px] text-[12px] text-[var(--pos)]">
          Ingresos:{' '}
          <span className="font-mono">
            {formatCurrency(d.ingresos, homeCurrency)}
          </span>
        </p>
      </div>
    )
  }

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-title font-semibold">Gasto por mes</h3>
          <p className="mx-0 mt-[2px] mb-0 text-caption text-[var(--text-faint)]">
            Ingresos detrás, en verde claro
          </p>
        </div>
        <div className="text-right">
          <div className="text-label text-muted-foreground">
            Promedio por mes con datos
          </div>
          <div className="font-mono text-subhead tabular-nums">
            {formatCurrency(avgMonthly, homeCurrency)}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={monthlyTrend}
          barGap={-22}
          barCategoryGap="28%"
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
          <Bar
            dataKey="ingresos"
            fill="var(--pos)"
            fillOpacity={0.18}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar dataKey="gastos" radius={[3, 3, 0, 0]} maxBarSize={22}>
            {monthlyTrend.map((entry) => (
              <Cell
                key={entry.key}
                fill="var(--neg)"
                fillOpacity={0.78}
                cursor={openMonth ? 'pointer' : undefined}
                onClick={() => openMonth?.(entry.key, 'debit')}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Keyboard equivalent of clicking a bar; visible when focused. */}
      {openMonth && (
        <nav
          aria-label="Gastos por mes"
          className="sr-only focus-within:not-sr-only focus-within:flex focus-within:flex-wrap focus-within:gap-1"
        >
          {monthlyTrend.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => openMonth(m.key, 'debit')}
              className="rounded border border-border px-2 py-0.5 text-xs"
            >
              Ver los gastos de {m.month}
            </button>
          ))}
        </nav>
      )}
    </Card>
  )
}
