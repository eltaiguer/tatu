// Ingresos vs Gastos — area trend chart, last 12 months.

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { Currency } from '../../models'
import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'
import { formatCurrency, formatCurrencyShort } from '../../utils/formatting'
import { Card } from '../ui/card'

interface IncomeExpenseChartProps {
  monthlyTrend: MonthlyTrendRow[]
  homeCurrency: Currency
  // Opens one month's rows; undefined when there is nowhere to navigate.
  openMonth?: (key: string, type?: 'credit' | 'debit') => void
}

export function IncomeExpenseChart({
  monthlyTrend,
  homeCurrency,
  openMonth,
}: IncomeExpenseChartProps) {
  // Hovered dot on the income/expense chart: clicking it opens that month's
  // income (or expenses) — the value the dot plots.
  function monthDot(fill: string, type: 'credit' | 'debit') {
    return {
      r: openMonth ? 6 : 4,
      fill,
      cursor: openMonth ? 'pointer' : undefined,
      onClick: (_event: unknown, dot: unknown) => {
        const key = (dot as { payload?: { key?: string } }).payload?.key
        if (key) openMonth?.(key, type)
      },
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-[20px] flex items-center justify-between">
        <div>
          <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
            Ingresos vs Gastos
          </h2>
          <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
            Últimos 12 meses
          </p>
        </div>
        <div className="flex gap-[18px]">
          {[
            { label: 'Ingresos', swatch: 'bg-[var(--pos)]' },
            { label: 'Gastos', swatch: 'bg-[var(--neg)]' },
          ].map(({ label, swatch }) => (
            <span
              key={label}
              className="inline-flex items-center gap-[7px] text-[13px] text-[var(--text-faint)]"
            >
              <span
                className={`inline-block h-[3px] w-[12px] rounded-[2px] ${swatch}`}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={monthlyTrend}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--pos)" stopOpacity={0.22} />
              <stop offset="95%" stopColor="var(--pos)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--neg)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--neg)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            stroke="var(--text-faint)"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="var(--text-faint)"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrencyShort(v, homeCurrency)}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            formatter={(value: ValueType) =>
              formatCurrency(Number(value), homeCurrency)
            }
          />
          <Area
            type="monotone"
            dataKey="ingresos"
            stroke="var(--pos)"
            strokeWidth={2.5}
            fill="url(#gradIngresos)"
            name="Ingresos"
            dot={false}
            activeDot={monthDot('var(--pos)', 'credit')}
          />
          <Area
            type="monotone"
            dataKey="gastos"
            stroke="var(--neg)"
            strokeWidth={2.5}
            fill="url(#gradGastos)"
            name="Gastos"
            dot={false}
            activeDot={monthDot('var(--neg)', 'debit')}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
