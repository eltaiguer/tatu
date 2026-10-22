// ¿Estás ahorrando? — 258px verdict + diverging net-per-month bars.

import {
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
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
import { summarizeSavings, niceTicks } from '../../services/charts/chart-data'
import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'
import { formatCurrency, formatCurrencyShort } from '../../utils/formatting'
import { Card } from '../ui/card'
import { MonthButtons } from './MonthButtons'

interface SavingsCardProps {
  monthlyTrend: MonthlyTrendRow[]
  homeCurrency: Currency
  // Opens one month's rows; undefined when there is nowhere to navigate.
  openMonth?: (key: string, type?: 'credit' | 'debit') => void
}

export function SavingsCard({
  monthlyTrend,
  homeCurrency,
  openMonth,
}: SavingsCardProps) {
  // ¿Estás ahorrando? values — headline is the median month so a single
  // one-off inflow can't make a mostly-losing year read as "saving".
  const savings = summarizeSavings(
    monthlyTrend.map((m) => ({ month: m.month, net: m.neto }))
  )
  const typicalNet = Math.round(savings.typicalNet)
  const saving = typicalNet >= 0
  const { positiveMonths } = savings
  const negativeMonths = savings.totalMonths - positiveMonths
  const savingsTicks = niceTicks(
    Math.min(0, ...monthlyTrend.map((m) => m.neto)),
    Math.max(0, ...monthlyTrend.map((m) => m.neto))
  )

  const savingsTooltip = ({
    active,
    payload,
    label,
  }: TooltipProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload as {
      ingresos: number
      gastos: number
      neto: number
    }
    return (
      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[14px] py-[10px] shadow-[var(--shadow-md)]">
        <p className="mx-0 mt-0 mb-[6px] text-[12px] text-[var(--text-faint)]">
          {label}
        </p>
        <p className="mx-0 my-[3px] text-[12px] text-[var(--pos)]">
          Ingresos:{' '}
          <span className="font-mono">
            {formatCurrency(d.ingresos, homeCurrency)}
          </span>
        </p>
        <p className="mx-0 my-[3px] text-[12px] text-[var(--neg)]">
          Gastos:{' '}
          <span className="font-mono">
            {formatCurrency(d.gastos, homeCurrency)}
          </span>
        </p>
        <p
          className="mx-0 my-[3px] text-[12px] font-semibold"
          style={{ color: d.neto >= 0 ? 'var(--pos)' : 'var(--neg)' }}
        >
          Balance:{' '}
          <span className="font-mono">
            {formatCurrency(d.neto, homeCurrency)}
          </span>
        </p>
      </div>
    )
  }

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[258px_1fr] gap-8 items-center">
        {/* Verdict text */}
        <div>
          {/* The section heading above names the months covered. */}
          <h3 className="m-0 mb-[10px] text-title font-semibold">
            ¿Estás ahorrando?
          </h3>
          <div className="text-[12px] font-medium text-muted-foreground">
            Mes típico (mediana de ingresos − gastos)
          </div>
          <div
            className="font-mono mt-[4px] text-[30px] font-semibold"
            style={{ color: saving ? 'var(--pos)' : 'var(--neg)' }}
          >
            {saving ? '+' : '−'}
            {formatCurrency(Math.abs(typicalNet), homeCurrency)}
          </div>
          <p className="mt-[12px] text-[14px] leading-[1.5]">
            {positiveMonths > negativeMonths
              ? 'Te queda dinero la mayoría de los meses.'
              : positiveMonths < negativeMonths
                ? 'Gastás más de lo que ingresás la mayoría de los meses.'
                : 'La mitad de los meses te queda dinero y la otra mitad no.'}
            {savings.outlier && (
              <>
                {' '}
                El promedio (
                <strong>
                  {savings.meanNet >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(savings.meanNet), homeCurrency)}
                </strong>
                ) está {savings.meanNet >= 0 ? 'inflado' : 'hundido'} por{' '}
                {savings.outlier.month} ({savings.outlier.net >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(savings.outlier.net), homeCurrency)}
                ).
              </>
            )}
          </p>
          <div className="mt-[8px] text-[12px] text-muted-foreground">
            {positiveMonths} de {monthlyTrend.length} meses en positivo
          </div>
        </div>

        {/* Diverging net bars */}
        <ResponsiveContainer width="100%" height={200}>
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
            <YAxis
              stroke="var(--text-faint)"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              ticks={savingsTicks}
              domain={[savingsTicks[0], savingsTicks[savingsTicks.length - 1]]}
              interval={0}
              tickFormatter={(v) => formatCurrencyShort(v, homeCurrency)}
              width={72}
            />
            <Tooltip content={savingsTooltip} />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
            <Bar dataKey="neto" radius={[3, 3, 0, 0]}>
              {monthlyTrend.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.neto >= 0 ? 'var(--pos)' : 'var(--neg)'}
                  fillOpacity={0.8}
                  cursor={openMonth ? 'pointer' : undefined}
                  onClick={() => openMonth?.(entry.key)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {openMonth && (
          <MonthButtons
            label="Movimientos por mes"
            buttons={monthlyTrend.map((m) => ({
              key: m.key,
              text: `Ver movimientos de ${m.month}`,
              onClick: () => openMonth(m.key),
            }))}
          />
        )}
      </div>
    </Card>
  )
}
