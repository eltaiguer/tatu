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
  summarizeSavings,
  niceTicks,
} from '../services/charts/chart-data'
import type { AccountSpend } from '../services/charts/chart-data'
import { categoryChanges } from '../services/charts/category-changes'
import { countsTowardTotals } from '../services/spending/spending-rules'
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

// Wraps a number so it opens the transactions behind it. A real button
// (keyboard + screen reader), visually the content itself; a plain block
// when there is nowhere to navigate.

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
    <div className="mx-0 mt-[34px] mb-[18px] flex items-baseline gap-[14px]">
      <h2 className="m-0 font-[family-name:var(--font-display)] text-[20px] font-semibold whitespace-nowrap">
        {label}
      </h2>
      {sub && (
        <span className="text-[13px] whitespace-nowrap text-[var(--text-faint)]">
          {sub}
        </span>
      )}
      <span className="h-[1px] flex-1 self-center bg-[var(--border)]" />
    </div>
  )
}

function SplitBar({ pctUSD, pctUYU }: { pctUSD: number; pctUYU: number }) {
  return (
    <div className="mb-[16px] flex h-[10px] overflow-hidden rounded-[5px] bg-[var(--surface-2)]">
      <div
        className="bg-[var(--brand)] [transition:width_0.3s]"
        style={{ width: `${pctUSD}%` }}
      />
      <div
        className="bg-[var(--accent)] [transition:width_0.3s]"
        style={{ width: `${pctUYU}%` }}
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
    <Card className="overflow-hidden p-0">
      <DrillTarget
        onOpen={onOpen}
        label={`Ver los gastos de ${label}`}
        className="flex flex-col gap-[14px] p-5"
      >
        {/* Header */}
        <div className="flex items-center gap-[11px]">
          <span className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[10px] bg-[var(--surface-2)] text-[var(--brand)]">
            <Icon size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="overflow-hidden text-[14px] font-semibold text-ellipsis whitespace-nowrap">
              {label}
            </div>
            <div className="text-[12px] text-[var(--text-faint)]">
              {sublabel}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div>
          <div className="text-[12px] font-medium text-[var(--text-faint)]">
            Gastos
          </div>
          <div className="font-mono mt-[4px] text-[22px] text-[var(--text)]">
            {formatCurrency(stat.conv, homeCurrency)}
          </div>
          {mixed && (
            <div className="font-mono mt-[3px] text-[12px] text-[var(--text-faint)]">
              US$ {Math.round(stat.USD).toLocaleString('es-UY')} · $U{' '}
              {Math.round(stat.UYU).toLocaleString('es-UY')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-[var(--border)] pt-[10px]">
          <div className="mb-[7px] h-[4px] overflow-hidden rounded-[2px] bg-[var(--surface-2)]">
            <div
              className="h-full rounded-[2px] bg-[var(--brand)]"
              style={{ width: `${stat.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[12px] text-[var(--text-faint)]">
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
    () => transactions.filter(countsTowardTotals),
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
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[14px] py-[10px] shadow-[var(--shadow-md)]">
          <p className="mb-[2px] text-[13px] font-semibold">{label}</p>
          <p className="font-mono text-[13px] text-[var(--text-faint)]">
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
            <p className="m-0 text-[11px] text-[var(--text-faint)]">
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
            <div className="mb-[20px]">
              <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
                {monthSummary.isCurrentMonth
                  ? 'Este mes'
                  : capitalize(monthSummary.monthLabel)}
                , todo en {curWord}
              </h2>
              <p className="mt-[4px] mb-0 text-[12px] text-[var(--text-faint)]">
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
                <div className="mb-[4px] text-[12px] font-medium text-muted-foreground">
                  Ingresos
                </div>
                <div className="font-mono text-[22px] text-[var(--pos)]">
                  {formatCurrency(monthSummary.income, homeCurrency)}
                </div>
              </DrillTarget>
              <DrillTarget
                onOpen={openSummaryMonth && (() => openSummaryMonth('debit'))}
                label="Ver los gastos del mes"
              >
                <div className="mb-[4px] text-[12px] font-medium text-muted-foreground">
                  Gastos
                </div>
                <div className="font-mono text-[22px] text-[var(--text)]">
                  {formatCurrency(monthSummary.expense, homeCurrency)}
                </div>
                <div className="font-mono mt-[8px] text-[11px] text-[var(--text-faint)]">
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
                <div className="mb-[4px] text-[12px] font-medium text-muted-foreground">
                  Balance neto
                </div>
                <div
                  className="font-mono text-[22px]"
                  style={{
                    color: monthSummary.net >= 0 ? 'var(--pos)' : 'var(--neg)',
                  }}
                >
                  {monthSummary.net >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(monthSummary.net), homeCurrency)}
                </div>
                <div className="mt-[8px] text-[12px] text-muted-foreground">
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
            <Card className="overflow-hidden p-0">
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
                <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
                  Mayor categoría
                </div>
                <div className="mb-[4px] text-[20px] font-bold">
                  {topCategory?.label ?? '—'}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {topCategory
                    ? `${Math.round(topCategory.pct)}% del gasto · todo el historial`
                    : 'Sin datos'}
                </div>
              </DrillTarget>
            </Card>
            <Card className="@container p-5">
              <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
                Gasto promedio mensual
              </div>
              <div
                className="font-mono mb-[4px] font-bold whitespace-nowrap"
                style={{
                  fontSize: fitMonoFontSize(
                    formatCurrency(avgMonthly, homeCurrency),
                    20
                  ),
                }}
              >
                {formatCurrency(avgMonthly, homeCurrency)}
              </div>
              <div className="text-[12px] text-muted-foreground">
                Últimos {monthlyTrend.length} meses
              </div>
            </Card>
            <Card className="p-5">
              <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
                Tasa de ahorro
              </div>
              <div
                className="mb-[4px] text-[20px] font-bold"
                style={{
                  color: savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)',
                }}
              >
                {savingsRate}%
              </div>
              <div className="text-[12px] text-muted-foreground">
                Ingresos no gastados · últimos {monthlyTrend.length} meses
              </div>
            </Card>
            <Card className="overflow-hidden p-0">
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
                <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
                  Sin categoría
                </div>
                <div className="font-mono mb-[4px] text-[20px] font-bold">
                  {formatCurrency(uncategorizedSpend?.total ?? 0, homeCurrency)}
                </div>
                <div className="text-[12px] text-muted-foreground">
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
                  <div className="mb-[10px] flex items-baseline gap-[10px]">
                    <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
                      ¿Estás ahorrando?
                    </h2>
                    <span className="text-[11px] text-[var(--text-faint)]">
                      Últimos 12 meses
                    </span>
                  </div>
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
            <div className="mb-[20px] flex items-baseline justify-between">
              <div>
                <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
                  Gasto por categoría
                </h2>
                {periodRange && (
                  <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
                    {periodRange}
                  </p>
                )}
              </div>
              {onNavigateToTransactions && (
                <button
                  onClick={() => onNavigateToTransactions({ type: 'debit' })}
                  className="flex cursor-pointer items-center gap-[4px] border-none bg-transparent text-[13px] font-medium text-[var(--brand)]"
                >
                  Ver movimientos <ArrowRight size={14} />
                </button>
              )}
            </div>
            {!hasExpenseData ? (
              <p className="text-[13px] text-muted-foreground">
                Sin gastos registrados.
              </p>
            ) : (
              <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[240px_1fr] sm:gap-9">
                {/* Decorative for assistive tech: the category list beside
                    it has the same numbers and actions (#203). */}
                <div
                  aria-hidden="true"
                  className="relative mx-auto h-[220px] w-[220px] sm:mx-0"
                >
                  <PieChart width={220} height={220}>
                    <Pie
                      rootTabIndex={-1}
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
                  <div className="pointer-events-none absolute top-[50%] left-[50%] [transform:translate(-50%,-50%)] text-center">
                    <div className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
                      TOTAL
                    </div>
                    <div className="font-mono text-[15px] font-bold">
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
              <div className="mb-[14px] flex items-baseline justify-between">
                <div>
                  <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
                    Gasto por moneda
                  </h2>
                  {periodRange && (
                    <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
                      {periodRange}
                    </p>
                  )}
                </div>
                <span className="text-[13px] text-muted-foreground">
                  Total {formatCurrency(currencySplit.total, homeCurrency)}
                </span>
              </div>
              <SplitBar
                pctUSD={currencySplit.pctUSD}
                pctUYU={currencySplit.pctUYU}
              />
              <div className="flex flex-wrap gap-[32px]">
                <div className="flex items-center gap-[10px]">
                  <span className="h-[10px] w-[10px] shrink-0 rounded-[3px] bg-[var(--brand)]" />
                  <div>
                    <div className="text-[13px] font-semibold">
                      Dólares · {Math.round(currencySplit.pctUSD)}%
                    </div>
                    <div className="font-mono text-[12px] text-muted-foreground">
                      {formatCurrency(currencySplit.USD, homeCurrency)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-[10px]">
                  <span className="h-[10px] w-[10px] shrink-0 rounded-[3px] bg-[var(--accent)]" />
                  <div>
                    <div className="text-[13px] font-semibold">
                      Pesos · {Math.round(currencySplit.pctUYU)}%
                    </div>
                    <div className="font-mono text-[12px] text-muted-foreground">
                      {formatCurrency(currencySplit.UYU, homeCurrency)}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Ingresos vs Gastos — area trend chart */}
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
              <div className="mb-[14px] flex items-center justify-between">
                <h2 className="m-0 font-[family-name:var(--font-sans)] text-[15px] font-semibold">
                  Movimientos recientes
                </h2>
                {onNavigateToTransactions && (
                  <button
                    onClick={() => onNavigateToTransactions({})}
                    className="flex cursor-pointer items-center gap-[4px] border-none bg-transparent text-[13px] font-medium text-[var(--brand)]"
                  >
                    Ver todos <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div className="flex flex-col">
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
                      className={`flex items-center gap-[12px] px-0 py-[10px] ${
                        i < recentTransactions.length - 1
                          ? 'border-b border-[var(--border)]'
                          : 'border-b-0'
                      }`}
                    >
                      <IconTile size="md" color={catDef.color}>
                        {catDef.icon}
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <div className="overflow-hidden text-[14px] font-medium text-ellipsis whitespace-nowrap">
                          {getDisplayDescription(tx)}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {formatDateCompact(tx.date)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className="font-mono block text-[14px]"
                          style={{
                            color: isCredit ? 'var(--pos)' : 'var(--text)',
                          }}
                        >
                          {isCredit ? '+' : '−'}
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                        {showConverted &&
                          convertedAmt !== null &&
                          Math.abs(convertedAmt) >= 0.005 && (
                            <span className="font-mono block text-[11px] text-muted-foreground">
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
                <div className="mb-[14px]">
                  <h2 className="m-0 font-[family-name:var(--font-sans)] text-[15px] font-semibold">
                    Mayores comercios
                  </h2>
                  {periodRange && (
                    <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
                      {periodRange}
                    </p>
                  )}
                </div>
                <div className="flex flex-col">
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
                        <span className="font-mono w-[16px] text-[12px] text-muted-foreground">
                          {i + 1}
                        </span>
                        <IconTile size="sm" color={display.color}>
                          {emoji ?? (
                            <span
                              className="block h-[8px] w-[8px] rounded-[50%]"
                              style={{ background: display.color }}
                            />
                          )}
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <div className="overflow-hidden text-[14px] font-medium text-ellipsis whitespace-nowrap">
                            {m.name}
                          </div>
                          <div className="text-[12px] text-muted-foreground">
                            {m.count}{' '}
                            {m.count > 1 ? 'movimientos' : 'movimiento'}
                          </div>
                        </div>
                        <span className="font-mono text-[13px]">
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
