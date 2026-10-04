// Dashboard — Resumen view: account cards + este mes + analysis section (merged)

import { Card } from './ui/card'
import { PageHeader } from './ui/page-header'
import { Button } from './ui/button'
import {
  Upload,
  EyeOff,
  ArrowRight,
  CreditCard,
  DollarSign,
  Banknote,
} from 'lucide-react'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { Category } from '../models'
import { useMemo, type ReactNode } from 'react'
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
} from '../services/categories/category-registry'
import {
  buildCurrentMonthSummary,
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
  buildCurrencySplit,
  spendByAccount,
  isExcludedFromTotals,
  summarizeSavings,
  niceTicks,
} from '../services/charts/chart-data'
import type { AccountSpend } from '../services/charts/chart-data'
import { categoryChanges } from '../services/charts/category-changes'
import { CategoryChangesCard } from './CategoryChangesCard'
import { convert } from '../services/currency/convert'
import { FxChip } from './FxChip'
import { CurrencyToggle } from './CurrencyToggle'
import {
  formatCurrency,
  formatCurrencyShort,
  fitMonoFontSize,
  formatDateCompact,
} from '../utils/formatting'
import { IconTile } from './ui/icon-tile'
import { getDisplayDescription } from '../utils/transaction-display'
import { CategoryBreakdownList } from './CategoryBreakdownList'
import type { CategoryBreakdownRow } from './CategoryBreakdownList'

// ── Internal sub-components ──────────────────────────────────────────────────

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Wraps a number so it opens the transactions behind it. A real button
// (keyboard + screen reader), visually the content itself; a plain block
// when there is nowhere to navigate.
// The period an account card's own number covers (accounts are imported
// separately, so one global range would be wrong for some of them).
function accountRange(stat: AccountSpend): string {
  if (!stat.first || !stat.last) return 'Sin gastos'
  const fmt = new Intl.DateTimeFormat('es-UY', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const from = fmt.format(stat.first)
  const to = fmt.format(stat.last)
  return from === to ? from : `${from} – ${to}`
}

// Id of the synthetic "Otros" row/slice (categories beyond the top 7).
const OTHER_ROW_ID = '__other__'

function DrillTarget({
  onOpen,
  label,
  children,
  className = '',
}: {
  onOpen?: () => void
  label: string
  children: ReactNode
  className?: string
}) {
  if (!onOpen) return <div className={className}>{children}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className={`block w-full rounded-md text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {children}
    </button>
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
          style={{
            fontSize: 13,
            color: 'var(--text-faint)',
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </span>
      )}
      <span
        style={{
          flex: 1,
          height: 1,
          background: 'var(--border)',
          alignSelf: 'center',
        }}
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
  onOpen?: () => void
}

function AccountExpenseCard({
  icon: Icon,
  label,
  sublabel,
  stat,
  homeCurrency,
  onOpen,
}: AccountExpenseCardProps) {
  const mixed = stat.USD > 0 && stat.UYU > 0
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <DrillTarget
        onOpen={onOpen}
        label={`Ver los gastos de ${label}`}
        className="flex flex-col gap-[14px] p-5"
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
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {sublabel}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-faint)',
            }}
          >
            Gastos
          </div>
          <div
            className="font-mono"
            style={{ fontSize: 22, marginTop: 4, color: 'var(--text)' }}
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
              fontSize: 12,
              color: 'var(--text-faint)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{stat.count} movimientos</span>
            <span className="font-mono">{Math.round(stat.pct)}% del gasto</span>
          </div>
        </div>
      </DrillTarget>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface DashboardProps {
  transactions: Transaction[]
  userName?: string
  onNavigateToImport?: () => void
  onNavigateToCategories?: () => void
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
  onNavigateToCategories,
  onNavigateToTransactions,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onSetHomeCurrency,
  onSetFxRate,
}: DashboardProps) {
  const hasTransactions = transactions.length > 0

  // Every figure on Resumen is computed from countable transactions only —
  // ignored categories (transfers, user-flagged) and split parents are out.
  const countedTransactions = useMemo(
    () => transactions.filter((tx) => !isExcludedFromTotals(tx)),
    [transactions]
  )

  // Data exists but every row is ignored — a zeroed dashboard would look like
  // a bug, so say why instead of rendering empty cards.
  const allIgnored = hasTransactions && countedTransactions.length === 0

  // Latest date used as reference month (avoids dependency on system clock).
  // Falls back to the raw rows when everything is ignored, so a transfers-only
  // dataset still labels the statement month instead of today's.
  const latestDate = useMemo(() => {
    const source = countedTransactions.length
      ? countedTransactions
      : transactions
    if (source.length === 0) return new Date()
    return source.reduce(
      (latest, tx) => (tx.date > latest ? tx.date : latest),
      source[0].date
    )
  }, [countedTransactions, transactions])

  // Date range across counted transactions — used for section period labels
  const periodRange = useMemo(() => {
    if (!countedTransactions.length) return null
    let min = countedTransactions[0].date
    let max = countedTransactions[0].date
    for (const tx of countedTransactions) {
      if (tx.date < min) min = tx.date
      if (tx.date > max) max = tx.date
    }
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-UY', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    return `${fmt(min)} – ${fmt(max)}`
  }, [countedTransactions])

  // Account spend by source
  const acctSpend = useMemo(
    () => spendByAccount(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
  )

  // "Este mes" — converted + combined totals in home currency
  const monthSummary = useMemo(
    () => buildCurrentMonthSummary(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
  )

  // Opens exactly the month card's rows (optionally only income/expenses).
  const openSummaryMonth =
    onNavigateToTransactions &&
    monthSummary.y !== undefined &&
    monthSummary.m !== undefined
      ? (type?: 'credit' | 'debit') =>
          onNavigateToTransactions({
            period: {
              mode: 'month',
              y: monthSummary.y as number,
              m: monthSummary.m as number,
            },
            ...(type && { type }),
          })
      : undefined

  // Category breakdown — all history (for donut)
  const emojiLookup = useMemo(() => {
    const map = new Map<string, string>()
    getCategoryDefinitions().forEach((d) => map.set(d.id, d.icon))
    return map
  }, [])

  const categoryData = useMemo(() => {
    const data = buildCategorySpendingConverted(
      transactions,
      homeCurrency,
      fxRate
    )
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

  const changes = useMemo(
    () => categoryChanges(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
  )

  // Uncategorized expenses: same rows and conversion as the category list,
  // so the tile's numbers equal the rows its link opens.
  const uncategorizedSpend = useMemo(
    () =>
      buildCategorySpendingConverted(transactions, homeCurrency, fxRate).find(
        (row) => row.category === Category.Uncategorized
      ),
    [transactions, homeCurrency, fxRate]
  )

  const totalExpenses = categoryData.reduce((s, c) => s + c.value, 0)
  const hasExpenseData = totalExpenses > 0

  const donutData = useMemo(() => {
    const top7 = categoryData.slice(0, 7)
    const otherVal = categoryData.slice(7).reduce((s, r) => s + r.value, 0)
    if (otherVal > 0) {
      return [
        ...top7,
        {
          categoryId: OTHER_ROW_ID,
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

  // The list mirrors the donut, including its "Otros" slice, so every slice
  // has a keyboard-reachable equivalent that opens exactly its rows.
  const otherCategoryIds = useMemo(
    () => categoryData.slice(7).map((row) => row.categoryId),
    [categoryData]
  )
  const openCategoryRow = onNavigateToTransactions
    ? (id: string) =>
        onNavigateToTransactions({
          categories: id === OTHER_ROW_ID ? otherCategoryIds : [id],
          type: 'debit',
        })
    : undefined
  const breakdownRows = useMemo<CategoryBreakdownRow[]>(
    () =>
      donutData.map((row) => ({
        id: row.categoryId,
        label: row.label,
        color: row.color,
        emoji: row.emoji,
        amount: row.value,
        pct: row.pct,
      })),
    [donutData]
  )

  // Monthly trend — last 12 months
  const monthlyTrend = useMemo(
    () =>
      buildMonthlyTrendsConverted(transactions, homeCurrency, fxRate)
        .slice(-12)
        .map((m) => ({
          key: m.month,
          month: new Intl.DateTimeFormat('es-UY', {
            year: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(m.month + '-01T00:00:00.000Z')),
          ingresos: m.income,
          gastos: m.expense,
          neto: m.net,
        })),
    [transactions, homeCurrency, fxRate]
  )

  // Opens exactly one month's rows (optionally only income or expenses), as
  // summed by the savings and income/expense charts.
  const openMonth = onNavigateToTransactions
    ? (key: string, type?: 'credit' | 'debit') => {
        const [y, m] = key.split('-').map(Number)
        onNavigateToTransactions({
          period: { mode: 'month', y, m: m - 1 },
          ...(type && { type }),
        })
      }
    : undefined

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

  // Currency split
  const currencySplit = useMemo(
    () => buildCurrencySplit(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
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

  // Top merchants — all history in home currency
  const topMerchants = useMemo(() => {
    const map = new Map<
      string,
      { name: string; total: number; count: number; catId: string }
    >()
    countedTransactions
      .filter((tx) => tx.type === 'debit')
      .forEach((tx) => {
        const key = getDisplayDescription(tx)
        const prev = map.get(key) ?? {
          name: key,
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
  }, [countedTransactions, homeCurrency, fxRate])

  // Recent transactions
  const recentTransactions = useMemo(
    () =>
      [...countedTransactions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 6),
    [countedTransactions]
  )

  const greeting = userName ? `Hola, ${userName} 👋` : 'Hola 👋'

  const curWord = homeCurrency === 'USD' ? 'dólares' : 'pesos'

  const customTooltip = ({
    active,
    payload,
  }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
      const value = Number(payload[0].value ?? 0)
      const label =
        (payload[0].payload as { label?: string } | undefined)?.label ??
        String(payload[0].name ?? '')
      return (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
            {label}
          </p>
          <p
            className="font-mono"
            style={{ fontSize: 13, color: 'var(--text-faint)' }}
          >
            {formatCurrency(value, homeCurrency)}
          </p>
        </div>
      )
    }
    return null
  }

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
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-faint)',
            margin: '0 0 6px',
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: 12, margin: '3px 0', color: 'var(--pos)' }}>
          Ingresos:{' '}
          <span className="font-mono">
            {formatCurrency(d.ingresos, homeCurrency)}
          </span>
        </p>
        <p style={{ fontSize: 12, margin: '3px 0', color: 'var(--neg)' }}>
          Gastos:{' '}
          <span className="font-mono">
            {formatCurrency(d.gastos, homeCurrency)}
          </span>
        </p>
        <p
          style={{
            fontSize: 12,
            margin: '3px 0',
            fontWeight: 600,
            color: d.neto >= 0 ? 'var(--pos)' : 'var(--neg)',
          }}
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
    <div className="space-y-6">
      <PageHeader
        title={greeting}
        subtitle={
          <>
            Tus cuentas Santander de un vistazo ·{' '}
            {monthSummary.monthLabel ||
              latestDate.toLocaleDateString('es-UY', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
          </>
        }
        actions={
          hasTransactions &&
          !allIgnored && (
            <>
              <FxChip fxRate={fxRate} onSetFxRate={onSetFxRate} />
              <CurrencyToggle
                value={homeCurrency}
                onChange={(c) => onSetHomeCurrency?.(c)}
              />
            </>
          )
        }
      />

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

      {/* Data exists, but nothing in it counts */}
      {allIgnored && (
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <EyeOff className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Todas tus transacciones están ignoradas</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Importaste {transactions.length}{' '}
              {transactions.length === 1 ? 'transacción' : 'transacciones'},
              pero todas caen en categorías ignoradas (transferencias u otras
              que marcaste), así que no suman a ningún total. Cambiales la
              categoría o desmarcá “ignorar” para verlas acá.
            </p>
          </div>
          {onNavigateToCategories && (
            <Button
              size="lg"
              variant="outline"
              onClick={onNavigateToCategories}
            >
              Revisar categorías
            </Button>
          )}
        </Card>
      )}

      {hasTransactions && !allIgnored && (
        <>
          {/* Lead with what changed, before the totals. */}
          <CategoryChangesCard
            changes={changes}
            homeCurrency={homeCurrency}
            onOpen={onNavigateToTransactions}
          />

          {/* Account source cards — 3-col grid */}
          {periodRange && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
              Período analizado: {periodRange}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <AccountExpenseCard
              icon={CreditCard}
              label="Tarjeta de crédito"
              sublabel={accountRange(acctSpend.card)}
              stat={acctSpend.card}
              homeCurrency={homeCurrency}
              onOpen={
                onNavigateToTransactions &&
                (() =>
                  onNavigateToTransactions({
                    accountType: 'credit_card',
                    type: 'debit',
                  }))
              }
            />
            <AccountExpenseCard
              icon={DollarSign}
              label="Cuenta USD"
              sublabel={accountRange(acctSpend.usd)}
              stat={acctSpend.usd}
              homeCurrency={homeCurrency}
              onOpen={
                onNavigateToTransactions &&
                (() =>
                  onNavigateToTransactions({
                    accountType: 'bank_account',
                    currency: 'USD',
                    type: 'debit',
                  }))
              }
            />
            <AccountExpenseCard
              icon={Banknote}
              label="Cuenta $U"
              sublabel={accountRange(acctSpend.uyu)}
              stat={acctSpend.uyu}
              homeCurrency={homeCurrency}
              onOpen={
                onNavigateToTransactions &&
                (() =>
                  onNavigateToTransactions({
                    accountType: 'bank_account',
                    currency: 'UYU',
                    type: 'debit',
                  }))
              }
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
                {monthSummary.isCurrentMonth
                  ? 'Este mes'
                  : capitalize(monthSummary.monthLabel)}
                , todo en {curWord}
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-faint)',
                  marginTop: 4,
                  marginBottom: 0,
                }}
              >
                {!monthSummary.isCurrentMonth &&
                  'Último mes con movimientos · importá tu extracto más reciente para ver este mes. '}
                Combina tus movimientos en US$ y $U usando el tipo de cambio.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <DrillTarget
                onOpen={openSummaryMonth && (() => openSummaryMonth('credit'))}
                label="Ver los ingresos del mes"
              >
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
              </DrillTarget>
              <DrillTarget
                onOpen={openSummaryMonth && (() => openSummaryMonth('debit'))}
                label="Ver los gastos del mes"
              >
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
                  style={{
                    fontSize: 11,
                    color: 'var(--text-faint)',
                    marginTop: 8,
                  }}
                >
                  US${' '}
                  {Math.round(monthSummary.split.USD).toLocaleString('es-UY')} +
                  $U{' '}
                  {Math.round(monthSummary.split.UYU).toLocaleString('es-UY')}
                </div>
              </DrillTarget>
              <DrillTarget
                onOpen={openSummaryMonth && (() => openSummaryMonth())}
                label="Ver los movimientos del mes"
              >
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
                    color: monthSummary.net >= 0 ? 'var(--pos)' : 'var(--neg)',
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
              </DrillTarget>
            </div>
          </Card>

          {/* Analysis section divider */}
          <SectionDivider
            label="Análisis"
            sub={`Tendencias y patrones · combinado en ${curWord}`}
          />

          {/* KPI tiles — 4-col */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <DrillTarget
                onOpen={
                  onNavigateToTransactions && topCategory
                    ? () =>
                        onNavigateToTransactions({
                          categories: [topCategory.categoryId],
                          type: 'debit',
                        })
                    : undefined
                }
                label={`Ver la mayor categoría: ${topCategory?.label ?? ''}`}
                className="h-full p-5"
              >
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
                    ? `${Math.round(topCategory.pct)}% del gasto · todo el historial`
                    : 'Sin datos'}
                </div>
              </DrillTarget>
            </Card>
            <Card className="p-5" style={{ containerType: 'inline-size' }}>
              <div
                className="text-muted-foreground"
                style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}
              >
                Gasto promedio mensual
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: fitMonoFontSize(
                    formatCurrency(avgMonthly, homeCurrency),
                    20
                  ),
                  fontWeight: 700,
                  marginBottom: 4,
                  whiteSpace: 'nowrap',
                }}
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
                Ingresos no gastados · últimos {monthlyTrend.length} meses
              </div>
            </Card>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <DrillTarget
                onOpen={
                  onNavigateToTransactions && uncategorizedSpend
                    ? () =>
                        onNavigateToTransactions({
                          categories: [Category.Uncategorized],
                          type: 'debit',
                        })
                    : undefined
                }
                label="Ver los gastos sin categoría"
                className="h-full p-5"
              >
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}
                >
                  Sin categoría
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}
                >
                  {formatCurrency(uncategorizedSpend?.total ?? 0, homeCurrency)}
                </div>
                <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                  {uncategorizedSpend
                    ? `${uncategorizedSpend.count} ${uncategorizedSpend.count === 1 ? 'gasto' : 'gastos'} · todo el historial`
                    : 'Todo categorizado'}
                </div>
              </DrillTarget>
            </Card>
          </div>

          {/* ¿Estás ahorrando? — 258px verdict + diverging chart */}
          {monthlyTrend.length > 0 && (
            <Card className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[258px_1fr] gap-8 items-center">
                {/* Verdict text */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      marginBottom: 10,
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
                      ¿Estás ahorrando?
                    </h2>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      Últimos 12 meses
                    </span>
                  </div>
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: 12, fontWeight: 500 }}
                  >
                    Mes típico (mediana de ingresos − gastos)
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
                    {formatCurrency(Math.abs(typicalNet), homeCurrency)}
                  </div>
                  <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
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
                          {formatCurrency(
                            Math.abs(savings.meanNet),
                            homeCurrency
                          )}
                        </strong>
                        ) está {savings.meanNet >= 0 ? 'inflado' : 'hundido'}{' '}
                        por {savings.outlier.month} (
                        {savings.outlier.net >= 0 ? '+' : '−'}
                        {formatCurrency(
                          Math.abs(savings.outlier.net),
                          homeCurrency
                        )}
                        ).
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
                      ticks={savingsTicks}
                      domain={[
                        savingsTicks[0],
                        savingsTicks[savingsTicks.length - 1],
                      ]}
                      interval={0}
                      tickFormatter={(v) =>
                        formatCurrencyShort(v, homeCurrency)
                      }
                      width={72}
                    />
                    <Tooltip content={savingsTooltip} />
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
                          cursor={openMonth ? 'pointer' : undefined}
                          onClick={() => openMonth?.(entry.key)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Keyboard equivalent of clicking a bar; visible when focused. */}
                {openMonth && (
                  <nav
                    aria-label="Movimientos por mes"
                    className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:flex focus-within:flex-wrap focus-within:gap-1"
                  >
                    {monthlyTrend.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => openMonth(m.key)}
                        className="rounded border border-border px-2 py-0.5 text-xs"
                      >
                        Ver movimientos de {m.month}
                      </button>
                    ))}
                  </nav>
                )}
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
              <div>
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
                {periodRange && (
                  <p
                    style={{
                      fontSize: 11,
                      color: 'var(--text-faint)',
                      margin: '2px 0 0',
                    }}
                  >
                    {periodRange}
                  </p>
                )}
              </div>
              {onNavigateToTransactions && (
                <button
                  onClick={() => onNavigateToTransactions({ type: 'debit' })}
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
              <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[240px_1fr] sm:gap-9">
                <div
                  className="mx-auto sm:mx-0"
                  style={{ position: 'relative', width: 220, height: 220 }}
                >
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
                          <Cell
                            key={i}
                            fill={entry.color}
                            cursor={openCategoryRow ? 'pointer' : undefined}
                            onClick={() => openCategoryRow?.(entry.categoryId)}
                          />
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
                  rows={breakdownRows}
                  currency={homeCurrency}
                  showPercent
                  onClickRow={openCategoryRow}
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
                <div>
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
                  {periodRange && (
                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--text-faint)',
                        margin: '2px 0 0',
                      }}
                    >
                      {periodRange}
                    </p>
                  )}
                </div>
                <span
                  className="text-muted-foreground"
                  style={{ fontSize: 13 }}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                      style={{ fontSize: 12 }}
                    >
                      {formatCurrency(currencySplit.USD, homeCurrency)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                      style={{ fontSize: 12 }}
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
              <div>
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
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-faint)',
                    margin: '2px 0 0',
                  }}
                >
                  Últimos 12 meses
                </p>
              </div>
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
                      fontSize: 13,
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
                    <stop
                      offset="5%"
                      stopColor="var(--pos)"
                      stopOpacity={0.22}
                    />
                    <stop offset="95%" stopColor="var(--pos)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--neg)"
                      stopOpacity={0.2}
                    />
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
                    tx.category ?? 'uncategorized'
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
                            fontSize: 14,
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
                          style={{ fontSize: 12 }}
                        >
                          {formatDateCompact(tx.date)}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 14,
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
                <div style={{ marginBottom: 14 }}>
                  <h2
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      margin: 0,
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    Mayores comercios
                  </h2>
                  {periodRange && (
                    <p
                      style={{
                        fontSize: 11,
                        color: 'var(--text-faint)',
                        margin: '2px 0 0',
                      }}
                    >
                      {periodRange}
                    </p>
                  )}
                </div>
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
                      <DrillTarget
                        key={i}
                        onOpen={
                          onNavigateToTransactions &&
                          (() =>
                            onNavigateToTransactions({
                              merchant: m.name,
                              type: 'debit',
                            }))
                        }
                        label={`Ver los gastos en ${m.name}`}
                        className="flex items-center gap-3 border-b border-border py-[10px]"
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
                              fontSize: 14,
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
                            style={{ fontSize: 12 }}
                          >
                            {m.count}{' '}
                            {m.count > 1 ? 'movimientos' : 'movimiento'}
                          </div>
                        </div>
                        <span className="font-mono" style={{ fontSize: 13 }}>
                          {formatCurrency(m.total, homeCurrency)}
                        </span>
                      </DrillTarget>
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
