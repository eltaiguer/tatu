// Dashboard — Resumen view: account cards + este mes + analysis section (merged)

import { Card } from './ui/card'
import { Button } from './ui/button'
import {
  Upload,
  ArrowRight,
  CreditCard,
  DollarSign,
  Banknote,
} from 'lucide-react'
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
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import { getCategoryDisplay } from '../utils/category-display'
import {
  getCategoryDefinition,
  getCategoryDefinitions,
  isCategoryIgnored,
} from '../services/categories/category-registry'
import { isTransferCategory } from '../services/transfers/internal-transfers'
import {
  buildCurrentMonthSummary,
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
  buildCurrencySplit,
  spendByAccount,
} from '../services/charts/chart-data'
import type { AccountSpend } from '../services/charts/chart-data'
import { convert } from '../services/currency/convert'
import { FxChip } from './FxChip'
import { CurrencyToggle } from './CurrencyToggle'
import {
  formatCurrency,
  formatCurrencyShort,
  formatDateCompact,
} from '../utils/formatting'
import { IconTile } from './ui/icon-tile'
import { getDisplayDescription } from '../utils/transaction-display'
import { CategoryBreakdownList } from './CategoryBreakdownList'
import type { CategoryBreakdownRow } from './CategoryBreakdownList'

// ── Internal sub-components ──────────────────────────────────────────────────

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max((v / max) * 100, 6)}%`,
            background: color,
            borderRadius: 2,
            opacity: 0.25 + 0.75 * (i / values.length),
          }}
        />
      ))}
    </div>
  )
}

function SectionDivider({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 14,
        margin: '34px 0 18px',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          margin: 0,
        }}
      >
        {label}
      </h2>
      {sub && (
        <span
          style={{ fontSize: 12.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}
        >
          {sub}
        </span>
      )}
      <span
        style={{ flex: 1, height: 1, background: 'var(--border)', alignSelf: 'center' }}
      />
    </div>
  )
}

function SplitBar({ pctUSD, pctUYU }: { pctUSD: number; pctUYU: number }) {
  return (
    <div
      style={{
        display: 'flex',
        height: 10,
        borderRadius: 5,
        overflow: 'hidden',
        background: 'var(--surface-2)',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          width: `${pctUSD}%`,
          background: 'var(--brand)',
          transition: 'width 0.3s',
        }}
      />
      <div
        style={{
          width: `${pctUYU}%`,
          background: 'var(--accent)',
          transition: 'width 0.3s',
        }}
      />
    </div>
  )
}

interface AccountExpenseCardProps {
  icon: React.ElementType
  label: string
  sublabel: string
  stat: AccountSpend
  homeCurrency: Currency
}

function AccountExpenseCard({
  icon: Icon,
  label,
  sublabel,
  stat,
  homeCurrency,
}: AccountExpenseCardProps) {
  const mixed = stat.USD > 0 && stat.UYU > 0
  return (
    <Card
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '20px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--surface-2)',
            color: 'var(--brand)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{sublabel}</div>
        </div>
      </div>

      {/* Amount */}
      <div>
        <div
          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}
        >
          Gastos del período
        </div>
        <div
          className="font-mono"
          style={{ fontSize: 23, marginTop: 4, color: 'var(--text)' }}
        >
          {formatCurrency(stat.conv, homeCurrency)}
        </div>
        {mixed && (
          <div
            className="font-mono"
            style={{ fontSize: 12, marginTop: 3, color: 'var(--text-faint)' }}
          >
            US$ {Math.round(stat.USD).toLocaleString('es-UY')} · $U{' '}
            {Math.round(stat.UYU).toLocaleString('es-UY')}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'var(--surface-2)',
            overflow: 'hidden',
            marginBottom: 7,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${stat.pct}%`,
              background: 'var(--brand)',
              borderRadius: 2,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-faint)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{stat.count} movimientos</span>
          <span className="font-mono">{Math.round(stat.pct)}% del gasto</span>
        </div>
      </div>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface DashboardProps {
  transactions: Transaction[]
  userName?: string
  onNavigateToImport?: () => void
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  homeCurrency?: Currency
  fxRate?: number
  onSetHomeCurrency?: (c: Currency) => void
  onSetFxRate?: (r: number) => void
}

export function Dashboard({
  transactions,
  userName,
  onNavigateToImport,
  onNavigateToTransactions,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onSetHomeCurrency,
  onSetFxRate,
}: DashboardProps) {
  const hasTransactions = transactions.length > 0

  // Latest date used as reference month (avoids dependency on system clock)
  const latestDate = useMemo(() => {
    if (transactions.length === 0) return new Date()
    return transactions.reduce(
      (latest, tx) => (tx.date > latest ? tx.date : latest),
      transactions[0].date,
    )
  }, [transactions])

  // Account spend by source
  const acctSpend = useMemo(
    () => spendByAccount(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate],
  )

  // "Este mes" — converted + combined totals in home currency
  const monthSummary = useMemo(
    () => buildCurrentMonthSummary(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate],
  )

  // Category breakdown — all history (for donut)
  const emojiLookup = useMemo(() => {
    const map = new Map<string, string>()
    getCategoryDefinitions().forEach((d) => map.set(d.id, d.icon))
    return map
  }, [])

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
          pct: (otherVal / (totalExpenses || 1)) * 100,
        },
      ]
    }
    return top7
  }, [categoryData, totalExpenses])

  // Monthly trend — last 12 months
  const monthlyTrend = useMemo(
    () =>
      buildMonthlyTrendsConverted(transactions, homeCurrency, fxRate)
        .slice(-12)
        .map((m) => ({
          month: new Intl.DateTimeFormat('es-UY', {
            year: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(m.month + '-01T00:00:00.000Z')),
          ingresos: m.income,
          gastos: m.expense,
          neto: m.net,
        })),
    [transactions, homeCurrency, fxRate],
  )

  // Income sparkline bars for "Este mes" card — derived from monthlyTrend
  const incomeBars = useMemo(
    () => monthlyTrend.slice(-6).map((m) => m.ingresos),
    [monthlyTrend],
  )

  // Currency split
  const currencySplit = useMemo(
    () => buildCurrencySplit(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate],
  )

  // KPI values
  const topCategory = categoryData[0]
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

  // ¿Estás ahorrando? values
  const avgNet = Math.round(
    monthlyTrend.reduce((s, m) => s + m.neto, 0) /
      Math.max(monthlyTrend.length, 1),
  )
  const positiveMonths = monthlyTrend.filter((m) => m.neto >= 0).length
  const saving = avgNet >= 0

  // Top merchants — all history in home currency
  const topMerchants = useMemo(() => {
    const map = new Map<
      string,
      { name: string; total: number; count: number; catId: string }
    >()
    transactions
      .filter(
        (tx) =>
          tx.type === 'debit' &&
          !isTransferCategory(tx.category) &&
          !isCategoryIgnored(tx.category),
      )
      .forEach((tx) => {
        const key = tx.description
        const prev = map.get(key) ?? {
          name: getDisplayDescription(tx),
          total: 0,
          count: 0,
          catId: tx.category ?? 'uncategorized',
        }
        prev.total += convert(tx.amount, tx.currency, homeCurrency, fxRate)
        prev.count++
        map.set(key, prev)
      })
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [transactions, homeCurrency, fxRate])

  // Recent transactions
  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 6),
    [transactions],
  )

  const greeting = userName ? `Hola, ${userName} 👋` : 'Hola 👋'

  const curWord = homeCurrency === 'USD' ? 'dólares' : 'pesos'

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
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
            {payload[0].name}
          </p>
          <p className="font-mono" style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            {formatCurrency(value, homeCurrency)}
          </p>
        </div>
      )
    }
    return null
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
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 30,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {greeting}
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            Tus cuentas Santander de un vistazo ·{' '}
            {monthSummary.monthLabel ||
              latestDate.toLocaleDateString('es-UY', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
          </p>
        </div>
        {hasTransactions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <FxChip fxRate={fxRate} onSetFxRate={onSetFxRate} />
            <CurrencyToggle
              value={homeCurrency}
              onChange={(c) => onSetHomeCurrency?.(c)}
            />
          </div>
        )}
      </div>

      {/* Empty state */}
      {!hasTransactions && (
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Empezá importando tu extracto</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Arrastrá tu archivo CSV de Santander Uruguay para ver tu dashboard
              con ingresos, gastos y estadísticas.
            </p>
          </div>
          {onNavigateToImport && (
            <Button size="lg" onClick={onNavigateToImport}>
              <Upload size={18} className="mr-2" />
              Importar extracto CSV
            </Button>
          )}
        </Card>
      )}

      {hasTransactions && (
        <>
          {/* Account source cards — 3-col grid */}
          <div
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <AccountExpenseCard
              icon={CreditCard}
              label="Tarjeta de crédito"
              sublabel="Santander"
              stat={acctSpend.card}
              homeCurrency={homeCurrency}
            />
            <AccountExpenseCard
              icon={DollarSign}
              label="Cuenta USD"
              sublabel="Santander USD"
              stat={acctSpend.usd}
              homeCurrency={homeCurrency}
            />
            <AccountExpenseCard
              icon={Banknote}
              label="Cuenta $U"
              sublabel="Santander $U"
              stat={acctSpend.uyu}
              homeCurrency={homeCurrency}
            />
          </div>

          {/* Este mes panel — converted + combined in home currency */}
          <Card className="p-6">
            <div style={{ marginBottom: 20 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Este mes, todo en {curWord}
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-faint)',
                  marginTop: 4,
                  marginBottom: 0,
                }}
              >
                Combina tus movimientos en US$ y $U usando el tipo de cambio.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}
                >
                  Ingresos
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 22, color: 'var(--pos)' }}
                >
                  {formatCurrency(monthSummary.income, homeCurrency)}
                </div>
                {incomeBars.length > 1 && (
                  <div style={{ marginTop: 12 }}>
                    <MiniBars values={incomeBars} color="var(--pos)" />
                  </div>
                )}
              </div>
              <div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}
                >
                  Gastos
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 22, color: 'var(--text)' }}
                >
                  {formatCurrency(monthSummary.expense, homeCurrency)}
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}
                >
                  US$ {Math.round(monthSummary.split.USD).toLocaleString('es-UY')}{' '}
                  + $U{' '}
                  {Math.round(monthSummary.split.UYU).toLocaleString('es-UY')}
                </div>
              </div>
              <div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}
                >
                  Balance neto
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 22,
                    color:
                      monthSummary.net >= 0 ? 'var(--pos)' : 'var(--neg)',
                  }}
                >
                  {monthSummary.net >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(monthSummary.net), homeCurrency)}
                </div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, marginTop: 8 }}
                >
                  {monthSummary.count} transacciones registradas
                </div>
              </div>
            </div>
          </Card>

          {/* Analysis section divider */}
          <SectionDivider
            label="Análisis"
            sub={`Tendencias y patrones · combinado en ${curWord}`}
          />

          {/* KPI tiles — 4-col */}
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
                {formatCurrency(avgMonthly, homeCurrency)}
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

          {/* ¿Estás ahorrando? — 258px verdict + diverging chart */}
          {monthlyTrend.length > 0 && (
            <Card className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[258px_1fr] gap-8 items-center">
                {/* Verdict text */}
                <div>
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      marginBottom: 10,
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    ¿Estás ahorrando?
                  </h2>
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  >
                    Promedio mensual (ingresos − gastos)
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: 30,
                      fontWeight: 600,
                      marginTop: 4,
                      color: saving ? 'var(--pos)' : 'var(--neg)',
                    }}
                  >
                    {saving ? '+' : '−'}
                    {formatCurrency(Math.abs(avgNet), homeCurrency)}
                  </div>
                  <p style={{ fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
                    {saving ? (
                      <>
                        Te queda dinero la mayoría de los meses. Ahorrás{' '}
                        <strong>{formatCurrency(Math.abs(avgNet), homeCurrency)}</strong>{' '}
                        por mes en promedio.
                      </>
                    ) : (
                      <>
                        Estás gastando más de lo que ingresás. En promedio te
                        faltan{' '}
                        <strong>{formatCurrency(Math.abs(avgNet), homeCurrency)}</strong>{' '}
                        por mes.
                      </>
                    )}
                  </p>
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: 12, marginTop: 8 }}
                  >
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
                      tickFormatter={(v) => formatCurrencyShort(v, homeCurrency)}
                      width={60}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                      }}
                      formatter={(value: ValueType) => [
                        formatCurrency(Number(value), homeCurrency),
                        'Neto',
                      ]}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="var(--border)"
                      strokeWidth={1.5}
                    />
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
              </div>
            </Card>
          )}

          {/* Gasto por categoría — donut + ranked rows (all-history) */}
          <Card className="p-6">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Gasto por categoría
              </h2>
              {onNavigateToTransactions && (
                <button
                  onClick={() => onNavigateToTransactions({})}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--brand)',
                    fontWeight: 500,
                  }}
                >
                  Ver movimientos <ArrowRight size={14} />
                </button>
              )}
            </div>
            {!hasExpenseData ? (
              <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                Sin gastos registrados.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'min(240px, 100%) 1fr',
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
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                      }}
                    >
                      TOTAL
                    </div>
                    <div
                      className="font-mono"
                      style={{ fontSize: 15, fontWeight: 700 }}
                    >
                      {formatCurrency(totalExpenses, homeCurrency)}
                    </div>
                  </div>
                </div>

                <CategoryBreakdownList
                  rows={categoryData.slice(0, 7).map<CategoryBreakdownRow>(
                    (row) => ({
                      id: row.categoryId,
                      label: row.label,
                      color: row.color,
                      emoji: row.emoji,
                      amount: row.value,
                      pct: row.pct,
                    }),
                  )}
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

          {/* Gasto por moneda — single SplitBar + legend */}
          {currencySplit.total > 0 && (
            <Card className="p-6">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 14,
                }}
              >
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    margin: 0,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Gasto por moneda
                </h2>
                <span
                  className="text-muted-foreground"
                  style={{ fontSize: 12.5 }}
                >
                  Total {formatCurrency(currencySplit.total, homeCurrency)}
                </span>
              </div>
              <SplitBar
                pctUSD={currencySplit.pctUSD}
                pctUYU={currencySplit.pctUYU}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 32,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: 'var(--brand)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Dólares · {Math.round(currencySplit.pctUSD)}%
                    </div>
                    <div
                      className="font-mono text-muted-foreground"
                      style={{ fontSize: 11.5 }}
                    >
                      {formatCurrency(currencySplit.USD, homeCurrency)}
                    </div>
                  </div>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Pesos · {Math.round(currencySplit.pctUYU)}%
                    </div>
                    <div
                      className="font-mono text-muted-foreground"
                      style={{ fontSize: 11.5 }}
                    >
                      {formatCurrency(currencySplit.UYU, homeCurrency)}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Ingresos vs Gastos — area trend chart */}
          <Card className="p-6">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                }}
              >
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

          {/* Bottom 2-col grid — recent transactions + top merchants */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Movimientos recientes */}
            <Card className="p-6">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    margin: 0,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Movimientos recientes
                </h2>
                {onNavigateToTransactions && (
                  <button
                    onClick={() => onNavigateToTransactions({})}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--brand)',
                      fontWeight: 500,
                    }}
                  >
                    Ver todos <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentTransactions.map((tx, i) => {
                  const catDef = getCategoryDefinition(
                    tx.category ?? 'uncategorized',
                  )
                  const isCredit = tx.type === 'credit'
                  const showConverted = tx.currency !== homeCurrency
                  const convertedAmt = showConverted
                    ? convert(tx.amount, tx.currency, homeCurrency, fxRate)
                    : null
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom:
                          i < recentTransactions.length - 1
                            ? '1px solid var(--border)'
                            : 'none',
                      }}
                    >
                      <IconTile size="md" color={catDef.color}>
                        {catDef.icon}
                      </IconTile>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {getDisplayDescription(tx)}
                        </div>
                        <div
                          className="text-muted-foreground"
                          style={{ fontSize: 11.5 }}
                        >
                          {formatDateCompact(tx.date)}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 13.5,
                            color: isCredit ? 'var(--pos)' : 'var(--text)',
                            display: 'block',
                          }}
                        >
                          {isCredit ? '+' : '−'}
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                        {showConverted &&
                          convertedAmt !== null &&
                          Math.abs(convertedAmt) >= 0.005 && (
                            <span
                              className="font-mono text-muted-foreground"
                              style={{ fontSize: 11, display: 'block' }}
                            >
                              ≈ {formatCurrency(convertedAmt, homeCurrency)}
                            </span>
                          )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Mayores comercios */}
            {topMerchants.length > 0 && (
              <Card className="p-6">
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    marginBottom: 14,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Mayores comercios
                </h2>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
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
                          padding: '10px 0',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <span
                          className="font-mono text-muted-foreground"
                          style={{ fontSize: 12, width: 16 }}
                        >
                          {i + 1}
                        </span>
                        <IconTile size="sm" color={display.color}>
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
                        </IconTile>
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
                            {m.count}{' '}
                            {m.count > 1 ? 'movimientos' : 'movimiento'}
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
        </>
      )}
    </div>
  )
}
