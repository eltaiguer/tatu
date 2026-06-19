// Charts - Análisis screen with KPIs, donut, trend, and top merchants

import { Card } from './ui/card'
import { ChartPie } from 'lucide-react'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { getCategoryDisplay } from '../utils/category-display'
import { getCategoryDefinitions, isCategoryIgnored } from '../services/categories/category-registry'
import { isTransferCategory } from '../services/transfers/internal-transfers'
import {
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
  buildCurrencySplit,
} from '../services/charts/chart-data'
import { convert } from '../services/currency/convert'
import { FxChip } from './FxChip'
import { formatCurrency, formatCurrencyShort } from '../utils/formatting'
import { CategoryBreakdownList } from './CategoryBreakdownList'
import type { CategoryBreakdownRow } from './CategoryBreakdownList'

interface ChartsProps {
  transactions: Transaction[]
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  homeCurrency?: Currency
  fxRate?: number
  onSetHomeCurrency?: (c: Currency) => void
  onSetFxRate?: (r: number) => void
}

export function Charts({
  transactions,
  onNavigateToTransactions,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onSetHomeCurrency,
  onSetFxRate,
}: ChartsProps) {
  const emojiLookup = useMemo(() => {
    const map = new Map<string, string>()
    getCategoryDefinitions().forEach((d) => map.set(d.id, d.icon))
    return map
  }, [])

  // Category breakdown — converted + combined
  const categoryData = useMemo(() => {
    const data = buildCategorySpendingConverted(transactions, homeCurrency, fxRate)
    const total = data.reduce((s, r) => s + r.total, 0) || 1
    return data.map((row) => {
      const display = getCategoryDisplay(row.category)
      return {
        categoryId: row.category,
        label: display.label,
        color: display.color,
        emoji: emojiLookup.get(row.category) ?? '',
        value: row.total,
        pct: (row.total / total) * 100,
      }
    })
  }, [transactions, homeCurrency, fxRate, emojiLookup])

  const totalExpenses = categoryData.reduce((s, c) => s + c.value, 0)
  const hasExpenseData = totalExpenses > 0

  // Monthly trend — converted + combined
  const monthlyTrend = useMemo(() => {
    return buildMonthlyTrendsConverted(transactions, homeCurrency, fxRate)
      .slice(-12)
      .map((m) => ({
        month: new Intl.DateTimeFormat('es-UY', { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(
          new Date(m.month + '-01T00:00:00.000Z')
        ),
        ingresos: m.income,
        gastos: m.expense,
        neto: m.net,
      }))
  }, [transactions, homeCurrency, fxRate])

  // Currency split card
  const currencySplit = useMemo(
    () => buildCurrencySplit(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate],
  )

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

  // Top merchants — spending across all history in home currency
  const topMerchants = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; catId: string }>()
    transactions
      .filter(
        (tx) =>
          tx.type === 'debit' &&
          !isTransferCategory(tx.category) &&
          !isCategoryIgnored(tx.category)
      )
      .forEach((tx) => {
        const key = tx.description
        const prev = map.get(key) ?? {
          name: key, total: 0, count: 0, catId: tx.category ?? 'uncategorized',
        }
        const converted = convert(tx.amount, tx.currency, homeCurrency, fxRate)
        prev.total += converted
        prev.count++
        map.set(key, prev)
      })
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [transactions, homeCurrency, fxRate])

  const hasData = transactions.length > 0
  const topCategory = categoryData[0]

  const donutData = useMemo(() => {
    const top7 = categoryData.slice(0, 7)
    const otherVal = categoryData.slice(7).reduce((s, r) => s + r.value, 0)
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
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,.08)',
          }}
        >
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{payload[0].name}</p>
          <p className="font-mono" style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            {formatCurrency(value, homeCurrency)}
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
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Análisis</h1>
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
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Análisis</h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            Tendencias y patrones de gasto en tus cuentas
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FxChip fxRate={fxRate} onSetFxRate={onSetFxRate} />
          <div
            style={{
              display: 'flex', background: 'var(--surface-2)',
              borderRadius: 10, padding: 3, gap: 2,
            }}
          >
            {(['USD', 'UYU'] as const).map((val) => (
              <button
                key={val}
                onClick={() => onSetHomeCurrency?.(val)}
                style={{
                  padding: '5px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500,
                  background: homeCurrency === val ? 'var(--bg)' : 'transparent',
                  color: homeCurrency === val ? 'var(--text)' : 'var(--text-faint)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: homeCurrency === val ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                }}
              >
                {val === 'USD' ? 'US$' : '$U'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
            Mayor categoría
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
            {topCategory?.label ?? '—'}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            {topCategory ? `${Math.round(topCategory.pct)}% del gasto` : 'Sin datos'}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
            Gasto promedio mensual
          </div>
          <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
            {formatCurrencyShort(avgMonthly, homeCurrency)}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            Últimos {monthlyTrend.length} meses
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
            Tasa de ahorro
          </div>
          <div
            style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)' }}
          >
            {savingsRate}%
          </div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>
            Ingresos no gastados
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
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
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, fontFamily: 'var(--font-sans)' }}>
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
              gridTemplateColumns: 'min(220px, 100%) 1fr',
              gap: 36,
              alignItems: 'center',
            }}
          >
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
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none',
                }}
              >
                <div className="text-muted-foreground" style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}>
                  TOTAL
                </div>
                <div className="font-mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  {formatCurrencyShort(totalExpenses, homeCurrency)}
                </div>
              </div>
            </div>

            <CategoryBreakdownList
              rows={
                categoryData.slice(0, 7).map<CategoryBreakdownRow>((row) => ({
                  id: row.categoryId,
                  label: row.label,
                  color: row.color,
                  emoji: row.emoji,
                  amount: row.value,
                  pct: row.pct,
                }))
              }
              currency={homeCurrency}
              showPercent
              onClickRow={
                onNavigateToTransactions
                  ? (id) => onNavigateToTransactions({ category: id })
                  : undefined
              }
            />
          </div>
        )}
      </Card>

      {/* Trend chart */}
      <Card className="p-6">
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, fontFamily: 'var(--font-sans)' }}>Ingresos vs Gastos</h2>
          <div style={{ display: 'flex', gap: 18 }}>
            {[
              { label: 'Ingresos', color: 'var(--pos)' },
              { label: 'Gastos', color: 'var(--neg)' },
            ].map(({ label, color }) => (
              <span
                key={label}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  gap: 7, fontSize: 12.5, color: 'var(--text-faint)',
                }}
              >
                <span
                  style={{
                    width: 12, height: 3, borderRadius: 2,
                    background: color, display: 'inline-block',
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={monthlyTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
              dataKey="month" stroke="var(--text-faint)"
              tick={{ fontSize: 12 }} axisLine={false} tickLine={false}
            />
            <YAxis
              stroke="var(--text-faint)" tick={{ fontSize: 12 }}
              axisLine={false} tickLine={false}
              tickFormatter={(v) => formatCurrencyShort(v, homeCurrency)} width={70}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
              }}
              formatter={(value: ValueType) => formatCurrency(Number(value), homeCurrency)}
            />
            <Area
              type="monotone" dataKey="ingresos" stroke="var(--pos)"
              strokeWidth={2.5} fill="url(#gradIngresos)" name="Ingresos"
              dot={false} activeDot={{ r: 4, fill: 'var(--pos)' }}
            />
            <Area
              type="monotone" dataKey="gastos" stroke="var(--neg)"
              strokeWidth={2.5} fill="url(#gradGastos)" name="Gastos"
              dot={false} activeDot={{ r: 4, fill: 'var(--neg)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ¿Estás ahorrando? — diverging monthly net bars */}
      {monthlyTrend.length > 0 && (
        <Card className="p-6">
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 4, fontFamily: 'var(--font-sans)' }}>
              ¿Estás ahorrando?
            </h2>
            <p className="text-muted-foreground" style={{ fontSize: 13 }}>
              Neto mensual (ingresos − gastos) en {homeCurrency === 'USD' ? 'dólares' : 'pesos'}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month" stroke="var(--text-faint)"
                tick={{ fontSize: 12 }} axisLine={false} tickLine={false}
              />
              <YAxis
                stroke="var(--text-faint)" tick={{ fontSize: 12 }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => formatCurrencyShort(v, homeCurrency)} width={70}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
                }}
                formatter={(value: ValueType) => [formatCurrency(Number(value), homeCurrency), 'Neto']}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
              <Bar dataKey="neto" radius={[3, 3, 0, 0]}>
                {monthlyTrend.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.neto >= 0 ? 'var(--pos)' : 'var(--neg)'}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                Promedio mensual neto
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 16, fontWeight: 700, marginTop: 2,
                  color: (totalIncome - totalExpenseTrend) >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              >
                {formatCurrencyShort(
                  monthlyTrend.length > 0
                    ? (totalIncome - totalExpenseTrend) / monthlyTrend.length
                    : 0,
                  homeCurrency
                )}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>Tasa de ahorro</div>
              <div
                style={{
                  fontSize: 16, fontWeight: 700, marginTop: 2,
                  color: savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              >
                {savingsRate}%
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Gasto por moneda */}
      {currencySplit.total > 0 && (
        <Card className="p-6">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, fontFamily: 'var(--font-sans)' }}>
            Gasto por moneda
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(
              [
                { key: 'USD' as const, label: 'US$ Dólares', pct: currencySplit.pctUSD, amount: currencySplit.USD },
                { key: 'UYU' as const, label: '$U Pesos', pct: currencySplit.pctUYU, amount: currencySplit.UYU },
              ] as const
            ).map((row) => (
              <div key={row.key}>
                <div
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{row.label}</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span className="font-mono" style={{ fontSize: 13 }}>
                      {formatCurrency(row.amount, homeCurrency)}
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
                    height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%', width: `${row.pct}%`,
                      background: row.key === 'USD' ? 'var(--brand)' : 'var(--accent)',
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <Card className="p-6">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, fontFamily: 'var(--font-sans)' }}>
            Mayores comercios
          </h2>
          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 36px' }}
          >
            {topMerchants.map((m, i) => {
              const display = getCategoryDisplay(m.catId)
              const emoji = emojiLookup.get(m.catId)
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 0', borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span className="font-mono text-muted-foreground" style={{ fontSize: 12, width: 16 }}>
                    {i + 1}
                  </span>
                  <span
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: display.color + '1f',
                      display: 'grid', placeItems: 'center',
                      fontSize: 14, flexShrink: 0,
                    }}
                  >
                    {emoji ?? (
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: display.color, display: 'block',
                        }}
                      />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5, fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {m.name}
                    </div>
                    <div className="text-muted-foreground" style={{ fontSize: 11.5 }}>
                      {m.count} {m.count > 1 ? 'movimientos' : 'movimiento'}
                    </div>
                  </div>
                  <span className="font-mono" style={{ fontSize: 13 }}>
                    {formatCurrency(m.total, homeCurrency)}
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
