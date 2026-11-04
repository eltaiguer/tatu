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
import { Card } from '../ui/card'
import { MonthButtons } from './MonthButtons'

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
  // Partial months are drawn but not averaged: ten days of a statement
  // would read as a cheap month.
  const avgMonthly = averageSpendOfMonthsWithSpend(
    monthlyTrend.filter((m) => m.complete).map((m) => m.gastos)
  )

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
          <span className="font-mono tabular-nums">
            {formatCurrency(d.gastos, homeCurrency)}
          </span>
        </p>
        <p className="mx-0 my-[3px] text-[12px] text-[var(--pos)]">
          Ingresos:{' '}
          <span className="font-mono tabular-nums">
            {formatCurrency(d.ingresos, homeCurrency)}
          </span>
        </p>
        {!d.complete && (
          <p className="mx-0 mt-[6px] mb-0 text-[12px] text-[var(--text-faint)]">
            Le faltan datos de alguna cuenta: no entra en el promedio
          </p>
        )}
      </div>
    )
  }

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-title font-semibold">Gasto por mes</h3>
          <p className="mx-0 mt-[2px] mb-0 text-caption text-[var(--text-faint)]">
            La barra más clara detrás de cada mes son tus ingresos
          </p>
        </div>
        {avgMonthly !== null && (
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
          <Bar
            dataKey="gastos"
            fill="var(--neg)"
            fillOpacity={0.78}
            radius={[3, 3, 0, 0]}
            maxBarSize={14}
            isAnimationActive={false}
            cursor={openMonth ? 'pointer' : undefined}
            onClick={(row: { key?: string }) =>
              row.key && openMonth?.(row.key, 'debit')
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
          label="Gastos e ingresos por mes"
          buttons={monthlyTrend.flatMap((m) => [
            {
              key: `${m.key}-debit`,
              text: `Ver los gastos de ${m.month}${m.complete ? '' : ' (mes incompleto)'}`,
              onClick: () => openMonth(m.key, 'debit'),
            },
            {
              key: `${m.key}-credit`,
              text: `Ver los ingresos de ${m.month}${m.complete ? '' : ' (mes incompleto)'}`,
              onClick: () => openMonth(m.key, 'credit'),
            },
          ])}
        />
      )}
    </Card>
  )
}
