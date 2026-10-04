// Dashboard — Resumen view: account cards + este mes + analysis section (merged)
// Sub-components live in ./dashboard/; this file owns the data memos.

import { PageHeader } from './ui/page-header'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { Category } from '../models'
import { useMemo } from 'react'
import { getCategoryDefinitions } from '../services/categories/category-registry'
import {
  buildCurrentMonthSummary,
  buildMerchantSpendingConverted,
  buildCategorySpendingConverted,
  buildCurrencySplit,
  spendByAccount,
} from '../services/charts/chart-data'
import {
  buildDonutRows,
  buildMonthlyTrendRows,
  periodRangeLabel,
  toCategorySpendRows,
} from '../services/charts/dashboard-rows'
import { categoryChanges } from '../services/charts/category-changes'
import { countsTowardTotals } from '../services/spending/spending-rules'
import { CategoryChangesCard } from './CategoryChangesCard'
import { FxChip } from './FxChip'
import { CurrencyToggle } from './CurrencyToggle'
import { AccountCards } from './dashboard/AccountCards'
import { CategorySpendCard } from './dashboard/CategorySpendCard'
import { CurrencySplitCard } from './dashboard/CurrencySplitCard'
import { AllIgnoredState, NoTransactionsState } from './dashboard/EmptyStates'
import { IncomeExpenseChart } from './dashboard/IncomeExpenseChart'
import { KpiTiles } from './dashboard/KpiTiles'
import { MonthSummaryCard } from './dashboard/MonthSummaryCard'
import { RecentTransactionsCard } from './dashboard/RecentTransactionsCard'
import { SavingsCard } from './dashboard/SavingsCard'
import { SectionDivider } from './dashboard/SectionDivider'
import { TopMerchantsCard } from './dashboard/TopMerchantsCard'

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
  const periodRange = useMemo(
    () => periodRangeLabel(countedTransactions),
    [countedTransactions]
  )

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

  // Category breakdown — all history (for donut)
  const emojiLookup = useMemo(() => {
    const map = new Map<string, string>()
    getCategoryDefinitions().forEach((d) => map.set(d.id, d.icon))
    return map
  }, [])

  const categoryData = useMemo(
    () =>
      toCategorySpendRows(
        buildCategorySpendingConverted(transactions, homeCurrency, fxRate),
        emojiLookup
      ),
    [transactions, homeCurrency, fxRate, emojiLookup]
  )

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

  const donutData = useMemo(
    () => buildDonutRows(categoryData, totalExpenses),
    [categoryData, totalExpenses]
  )

  const otherCategoryIds = useMemo(
    () => categoryData.slice(7).map((row) => row.categoryId),
    [categoryData]
  )

  // Monthly trend — last 12 months
  const monthlyTrend = useMemo(
    () => buildMonthlyTrendRows(transactions, homeCurrency, fxRate),
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

  // Currency split
  const currencySplit = useMemo(
    () => buildCurrencySplit(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
  )

  // Top merchants — all history in home currency, grouped by the merchant
  // key the Transacciones merchant filter matches on.
  const topMerchants = useMemo(
    () =>
      buildMerchantSpendingConverted(transactions, homeCurrency, fxRate).slice(
        0,
        6
      ),
    [transactions, homeCurrency, fxRate]
  )

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
        <NoTransactionsState onNavigateToImport={onNavigateToImport} />
      )}

      {/* Data exists, but nothing in it counts */}
      {allIgnored && (
        <AllIgnoredState
          transactionCount={transactions.length}
          onNavigateToCategories={onNavigateToCategories}
        />
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
          <AccountCards
            acctSpend={acctSpend}
            homeCurrency={homeCurrency}
            onNavigateToTransactions={onNavigateToTransactions}
          />

          <MonthSummaryCard
            monthSummary={monthSummary}
            homeCurrency={homeCurrency}
            curWord={curWord}
            onNavigateToTransactions={onNavigateToTransactions}
          />

          {/* Analysis section divider */}
          <SectionDivider
            label="Análisis"
            sub={`Tendencias y patrones · combinado en ${curWord}`}
          />

          <KpiTiles
            topCategory={categoryData[0]}
            monthlyTrend={monthlyTrend}
            uncategorizedSpend={uncategorizedSpend}
            homeCurrency={homeCurrency}
            onNavigateToTransactions={onNavigateToTransactions}
          />

          {monthlyTrend.length > 0 && (
            <SavingsCard
              monthlyTrend={monthlyTrend}
              homeCurrency={homeCurrency}
              openMonth={openMonth}
            />
          )}

          <CategorySpendCard
            donutData={donutData}
            otherCategoryIds={otherCategoryIds}
            totalExpenses={totalExpenses}
            periodRange={periodRange}
            homeCurrency={homeCurrency}
            onNavigateToTransactions={onNavigateToTransactions}
          />

          {currencySplit.total > 0 && (
            <CurrencySplitCard
              currencySplit={currencySplit}
              periodRange={periodRange}
              homeCurrency={homeCurrency}
            />
          )}

          <IncomeExpenseChart
            monthlyTrend={monthlyTrend}
            homeCurrency={homeCurrency}
            openMonth={openMonth}
          />

          {/* Bottom 2-col grid — recent transactions + top merchants */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentTransactionsCard
              recentTransactions={recentTransactions}
              homeCurrency={homeCurrency}
              fxRate={fxRate}
              onNavigateToTransactions={onNavigateToTransactions}
            />
            {topMerchants.length > 0 && (
              <TopMerchantsCard
                topMerchants={topMerchants}
                emojiLookup={emojiLookup}
                periodRange={periodRange}
                homeCurrency={homeCurrency}
                onNavigateToTransactions={onNavigateToTransactions}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
