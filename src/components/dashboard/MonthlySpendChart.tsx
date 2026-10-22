// Gasto por mes — one bar per month with data (spend), income as a lighter
// bar behind it. Bars, not a curve: months without data are not drawn
// between. Each bar opens its month's expenses; the income bar its income.

import {
  BarChart,
  Bar,
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
import { todayAsUtcDate } from '../../utils/date-utils'
import { Card } from '../ui/card'
import { MonthButtons } from './MonthButtons'

// Average spend of the months that are over and had any: a month with only a
// salary, or the month still running, would pull it down.
export function averageMonthlySpend(
  monthlyTrend: MonthlyTrendRow[],
  today: Date = todayAsUtcDate()
): number | null {
  const current = today.toISOString().slice(0, 7)
  const months = monthlyTrend.filter((m) => m.gastos > 0 && m.key !== current)
  if (months.length === 0) return null
  return Math.round(months.reduce((s, m) => s + m.gastos, 0) / months.length)
}

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
  const avgMonthly = averageMonthlySpend(monthlyTrend)

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
            La barra más clara detrás de cada mes son tus ingresos
          </p>
        </div>
        {avgMonthly !== null && (
          <div className="sm:text-right">
            <div className="text-label text-muted-foreground">
              Promedio por mes con gastos
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
          />
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
          />
        </BarChart>
      </ResponsiveContainer>
      {openMonth && (
        <MonthButtons
          label="Gastos e ingresos por mes"
          buttons={monthlyTrend.flatMap((m) => [
            {
              key: `${m.key}-debit`,
              text: `Ver los gastos de ${m.month}`,
              onClick: () => openMonth(m.key, 'debit'),
            },
            {
              key: `${m.key}-credit`,
              text: `Ver los ingresos de ${m.month}`,
              onClick: () => openMonth(m.key, 'credit'),
            },
          ])}
        />
      )}
    </Card>
  )
}
