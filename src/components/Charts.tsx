// Charts - Análisis screen with KPIs, donut, trend, and top merchants

import { Card } from './ui/card'
import { ChartPie } from 'lucide-react'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { useMemo, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
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
import { getCategoryDisplay } from '../utils/category-display'
import { getCategoryDefinitions } from '../services/categories/category-registry'
import { isTransferCategory } from '../services/transfers/internal-transfers'

function formatAmt(amount: number, currency: Currency): string {
  const formatted = Math.abs(amount).toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency === 'UYU' ? `$U ${formatted}` : `US$ ${formatted}`
}

function formatAmtShort(amount: number, currency: Currency): string {
  const abs = Math.abs(amount)
  const sym = currency === 'UYU' ? '$U' : 'US$'
  if (abs >= 1_000_000) return `${sym} ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sym} ${(abs / 1_000).toFixed(0)}k`
  return formatAmt(amount, currency)
}

interface ChartsProps {
  transactions: Transaction[]
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function Charts({ transactions, onNavigateToTransactions }: ChartsProps) {
  const [currency, setCurrency] = useState<Currency>('UYU')

  // Emoji icon lookup from category definitions
  const emojiLookup = useMemo(() => {
    const map = new Map<string, string>()
    getCategoryDefinitions().forEach((d) => map.set(d.id, d.icon))
    return map
  }, [])

  const currencyTxs = useMemo(
    () => transactions.filter((tx) => tx.currency === currency),
    [transactions, currency],
  )

  // Category breakdown (expenses only, no transfers)
  const categoryData = useMemo(() => {
    const grouped = new Map<string, number>()
    currencyTxs
      .filter((tx) => tx.type === 'debit' && !isTransferCategory(tx.category))
      .forEach((tx) => {
        const cat = tx.category ?? 'uncategorized'
        grouped.set(cat, (grouped.get(cat) ?? 0) + tx.amount)
      })

    const total = Array.from(grouped.values()).reduce((s, v) => s + v, 0)
    return Array.from(grouped.entries())
      .map(([catId, value]) => {
        const display = getCategoryDisplay(catId)
        return {
          categoryId: catId,
          label: display.label,
          color: display.color,
          emoji: emojiLookup.get(catId) ?? '',
          value,
          pct: total > 0 ? (value / total) * 100 : 0,
        }
      })
      .sort((a, b) => b.value - a.value)
  }, [currencyTxs, emojiLookup])

  const totalExpenses = categoryData.reduce((s, c) => s + c.value, 0)
  const hasExpenseData = totalExpenses > 0

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const grouped = new Map<string, { income: number; expense: number; key: string }>()
    currencyTxs.forEach((tx) => {
      if (isTransferCategory(tx.category)) return
      const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
      const label = new Intl.DateTimeFormat('es-UY', {
        year: 'numeric',
        month: 'short',
      }).format(tx.date)
      if (!grouped.has(key)) grouped.set(key, { income: 0, expense: 0, key: label })
      const entry = grouped.get(key)!
      if (tx.type === 'credit') entry.income += tx.amount
      else entry.expense += tx.amount
    })
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ month: v.key, ingresos: v.income, gastos: v.expense }))
      .slice(-12)
  }, [currencyTxs])

  const totalIncome = monthlyTrend.reduce((s, m) => s + m.ingresos, 0)
  const totalExpenseTrend = monthlyTrend.reduce((s, m) => s + m.gastos, 0)
  const savingsRate =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpenseTrend) / totalIncome) * 100)
      : 0
  const avgMonthly =
    monthlyTrend.length > 0
      ? Math.round(totalExpenseTrend / monthlyTrend.length)
      : 0

  // Top merchants by spend
  const topMerchants = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; catId: string }>()
    currencyTxs
      .filter((tx) => tx.type === 'debit' && !isTransferCategory(tx.category))
      .forEach((tx) => {
        const key = tx.description
        const entry = map.get(key) ?? {
          name: key,
          total: 0,
          count: 0,
          catId: tx.category ?? 'uncategorized',
        }
        entry.total += tx.amount
        entry.count++
        map.set(key, entry)
      })
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [currencyTxs])

  const hasData = transactions.length > 0

  const topCategory = categoryData[0]

  const donutData = useMemo(() => {
    const top7 = categoryData.slice(0, 7)
    const otherVal = categoryData
      .slice(7)
      .reduce((s, r) => s + r.value, 0)
    if (otherVal > 0) {
      return [
        ...top7,
        {
          categoryId: '__other__',
          label: 'Otros',
          color: 'var(--surface-3)',
          emoji: '',
          value: otherVal,
          pct: (otherVal / totalExpenses) * 100,
        },
      ]
    }
    return top7
  }, [categoryData, totalExpenses])

  const customTooltip = ({
    active,
    payload,
  }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
      const value = Number(payload[0].value ?? 0)
      return (
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,.08)',
          }}
        >
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
            {payload[0].name}
          </p>
          <p
            className="font-mono"
            style={{ fontSize: 13, color: 'var(--text-faint)' }}
          >
            {formatAmt(value, currency)}
          </p>
        </div>
      )
    }
    return null
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
            Análisis
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            Tendencias y patrones de gasto en tus cuentas
          </p>
        </div>
        <Card className="p-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <ChartPie className="text-primary" size={28} />
          </div>
          <div>
            <h3 className="mb-2">Sin datos para visualizar</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Importá transacciones desde la pestaña Importar para ver gráficos
              de gastos por categoría, tendencias mensuales y más.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
            Análisis
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            Tendencias y patrones de gasto en tus cuentas
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            background: 'var(--surface-2)',
            borderRadius: 10,
            padding: 3,
            gap: 2,
          }}
        >
          {(
            [
              { value: 'UYU', label: 'Pesos $U' },
              { value: 'USD', label: 'Dólares US$' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setCurrency(value)}
              style={{
                padding: '5px 14px',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 500,
                background:
                  currency === value ? 'var(--bg)' : 'transparent',
                color:
                  currency === value ? 'var(--text)' : 'var(--text-faint)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow:
                  currency === value ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div
            className="text-muted-foreground"
            style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}
          >
            Mayor categoría
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
            {topCategory?.label ?? '—'}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            {topCategory
              ? `${Math.round(topCategory.pct)}% del gasto`
              : 'Sin datos'}
          </div>
        </Card>
        <Card className="p-5">
          <div
            className="text-muted-foreground"
            style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}
          >
            Gasto promedio mensual
          </div>
          <div
            className="font-mono"
            style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}
          >
            {formatAmtShort(avgMonthly, currency)}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            Últimos {monthlyTrend.length} meses
          </div>
        </Card>
        <Card className="p-5">
          <div
            className="text-muted-foreground"
            style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}
          >
            Tasa de ahorro
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 4,
              color: savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)',
            }}
          >
            {savingsRate}%
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            Ingresos no gastados
          </div>
        </Card>
        <Card className="p-5">
          <div
            className="text-muted-foreground"
            style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}
          >
            Categorías activas
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
            {categoryData.length}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            Con gasto registrado
          </div>
        </Card>
      </div>

      {/* Donut + category breakdown */}
      <Card className="p-6">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
          Gasto por categoría
        </h2>
        {!hasExpenseData ? (
          <p className="text-muted-foreground" style={{ fontSize: 13 }}>
            Sin gastos registrados para este período.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr',
              gap: 36,
              alignItems: 'center',
            }}
          >
            {/* Donut */}
            <div style={{ position: 'relative', width: 220, height: 220 }}>
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={100}
                    dataKey="value"
                    startAngle={90}
                    endAngle={450}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={customTooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}
                >
                  TOTAL
                </div>
                <div className="font-mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  {formatAmtShort(totalExpenses, currency)}
                </div>
              </div>
            </div>

            {/* Breakdown list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {categoryData.slice(0, 7).map((row) => (
                <div
                  key={row.categoryId}
                  onClick={() =>
                    onNavigateToTransactions?.({ category: row.categoryId })
                  }
                  style={{
                    cursor: onNavigateToTransactions ? 'pointer' : 'default',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13.5,
                        fontWeight: 500,
                      }}
                    >
                      {row.emoji ? (
                        <span style={{ fontSize: 14 }}>{row.emoji}</span>
                      ) : (
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 3,
                            background: row.color,
                            display: 'inline-block',
                          }}
                        />
                      )}
                      {row.label}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        gap: 10,
                        alignItems: 'baseline',
                      }}
                    >
                      <span className="font-mono" style={{ fontSize: 13 }}>
                        {formatAmt(row.value, currency)}
                      </span>
                      <span
                        className="font-mono text-muted-foreground"
                        style={{ fontSize: 11.5, width: 38, textAlign: 'right' }}
                      >
                        {row.pct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: 'var(--surface-2)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${row.pct}%`,
                        background: row.color,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Trend chart */}
      <Card className="p-6">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Ingresos vs Gastos
          </h2>
          <div style={{ display: 'flex', gap: 18 }}>
            {[
              { label: 'Ingresos', color: 'var(--pos)' },
              { label: 'Gastos', color: 'var(--neg)' },
            ].map(({ label, color }) => (
              <span
                key={label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12.5,
                  color: 'var(--text-faint)',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 3,
                    borderRadius: 2,
                    background: color,
                    display: 'inline-block',
                  }}
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
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
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
              tickFormatter={(v) => formatAmtShort(v, currency)}
              width={70}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
              formatter={(value: ValueType) =>
                formatAmt(Number(value), currency)
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
              activeDot={{ r: 4, fill: 'var(--pos)' }}
            />
            <Area
              type="monotone"
              dataKey="gastos"
              stroke="var(--neg)"
              strokeWidth={2.5}
              fill="url(#gradGastos)"
              name="Gastos"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--neg)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <Card className="p-6">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>
            Mayores comercios
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0 36px',
            }}
          >
            {topMerchants.map((m, i) => {
              const display = getCategoryDisplay(m.catId)
              const emoji = emojiLookup.get(m.catId)
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span
                    className="font-mono text-muted-foreground"
                    style={{ fontSize: 12, width: 16 }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: display.color + '1f',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {emoji ?? (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: display.color,
                          display: 'block',
                        }}
                      />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {m.name}
                    </div>
                    <div
                      className="text-muted-foreground"
                      style={{ fontSize: 11.5 }}
                    >
                      {m.count} {m.count > 1 ? 'movimientos' : 'movimiento'}
                    </div>
                  </div>
                  <span className="font-mono" style={{ fontSize: 13 }}>
                    {formatAmt(m.total, currency)}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
