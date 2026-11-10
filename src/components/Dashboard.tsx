// Dashboard — Resumen view: what changed, the month in one sentence, then
// three questions (where the money went, month by month, your accounts).
// Sub-components live in ./dashboard/; this file owns the data memos.

import { PageHeader } from './ui/page-header'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { Category } from '../models'
import { useMemo } from 'react'
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
import {
  currentCategoryHousehold,
  rowHouseholdView,
} from '../services/household/household'
import { CategoryChangesCard } from './CategoryChangesCard'
import { FxChip } from './FxChip'
import { CurrencyToggle } from './CurrencyToggle'
import { AccountCards } from './dashboard/AccountCards'
import { CategorySpendCard } from './dashboard/CategorySpendCard'
import { CurrencySplitCard } from './dashboard/CurrencySplitCard'
import {
  AllIgnoredState,
  NoHouseholdState,
  NoTransactionsState,
} from './dashboard/EmptyStates'
import { HouseholdModeToggle } from './dashboard/HouseholdModeToggle'
import { MonthHero } from './dashboard/MonthHero'
import { MonthlySpendChart } from './dashboard/MonthlySpendChart'
import { RecentTransactionsCard } from './dashboard/RecentTransactionsCard'
import { SavingsCard } from './dashboard/SavingsCard'
import { ResumenSection } from './dashboard/ResumenSection'
import { TopMerchantsCard } from './dashboard/TopMerchantsCard'
import { UncategorizedNudge } from './dashboard/UncategorizedNudge'
import { newestDate, todayAsUtcDate, toMonthKey } from '../utils/date-utils'

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
  // Hogar mode: every figure covers the household expenses only. The URL
  // owns it (`/?hogar=si`); the caller reads and writes it.
  householdMode?: boolean
  onHouseholdModeChange?: (householdMode: boolean) => void
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
  householdMode = false,
  onHouseholdModeChange,
}: DashboardProps) {
  const hasTransactions = transactions.length > 0

  // Every figure on Resumen is computed from countable transactions only —
  // ignored categories (transfers, user-flagged) and split parents are out.
  const countableTransactions = useMemo(
    () => transactions.filter(countsTowardTotals),
    [transactions]
  )

  // Data exists but every row is ignored — a zeroed dashboard would look like
  // a bug, so say why instead of rendering empty cards.
  const allIgnored = hasTransactions && countableTransactions.length === 0

  // Hogar mode is ONE cut at the top: the rows that resolve to household
  // (counted expenses only; ADR-0005) replace `transactions` in every memo
  // below. The map is memoized on the category store's array, so a changed
  // category default changes `householdRows` and everything under it.
  const categoryHousehold = currentCategoryHousehold()
  const householdRows = useMemo(
    () =>
      transactions.filter(
        (tx) => rowHouseholdView(tx, categoryHousehold)?.status === 'household'
      ),
    [transactions, categoryHousehold]
  )
  const rows = householdMode ? householdRows : transactions
  const countedTransactions = useMemo(
    () => rows.filter(countsTowardTotals),
    [rows]
  )
  const noHouseholdSpend = householdMode && householdRows.length === 0

  // Every drill-through in Hogar mode opens the household rows only; one
  // wrapper here instead of an edit in each card. Todo adds nothing.
  const openTransactions = useMemo(
    () =>
      onNavigateToTransactions && householdMode
        ? (filter: TransactionsFilter) =>
            onNavigateToTransactions({ ...filter, household: 'household' })
        : onNavigateToTransactions,
    [onNavigateToTransactions, householdMode]
  )

  // Latest date used as reference month (avoids dependency on system clock).
  // Falls back to the raw rows when everything is ignored, so a transfers-only
  // dataset still labels the statement month instead of today's.
  const latestDate = useMemo(() => {
    // Formatted in UTC like every tx date, so "today" must be one too (#58).
    return (
      newestDate(countableTransactions) ??
      newestDate(transactions) ??
      todayAsUtcDate()
    )
  }, [countableTransactions, transactions])

  // Date range across counted transactions — used for section period labels
  const periodRange = useMemo(
    () => periodRangeLabel(countedTransactions),
    [countedTransactions]
  )

  // Account spend by source
  const acctSpend = useMemo(
    () => spendByAccount(rows, homeCurrency, fxRate),
    [rows, homeCurrency, fxRate]
  )

  // "Este mes" — converted + combined totals in home currency. The hero's
  // month is always the Todo month (the newest with counted rows of any
  // kind): Hogar mode reads that same month even when its own rows end
  // earlier, so switching the mode never moves the month.
  const todaySummary = useMemo(
    () => buildCurrentMonthSummary(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
  )
  const monthSummary = useMemo(
    () =>
      householdMode
        ? buildCurrentMonthSummary(
            householdRows,
            homeCurrency,
            fxRate,
            undefined,
            todaySummary.y !== undefined && todaySummary.m !== undefined
              ? { y: todaySummary.y, m: todaySummary.m }
              : undefined
          )
        : todaySummary,
    [householdMode, householdRows, todaySummary, homeCurrency, fxRate]
  )

  // Category breakdown — all history (for donut)
  const categorySpending = useMemo(
    () => buildCategorySpendingConverted(rows, homeCurrency, fxRate),
    [rows, homeCurrency, fxRate]
  )
  // Labels, colours and icons are resolved at render, not memoized with the
  // sums: custom categories can load or change without `transactions`
  // changing. One resolveCategory per category is cheap.
  const categoryData = toCategorySpendRows(categorySpending)

  // Today's month (a string, so memos hold): it is never complete. Both
  // "Qué cambió" and "Mes a mes" recompute when it rolls over.
  const currentMonth = toMonthKey(todayAsUtcDate())

  const changes = useMemo(
    // Which months are complete is about the statements, so it reads every
    // row even when the comparison covers the household ones.
    () => categoryChanges(rows, homeCurrency, fxRate, undefined, transactions),
    // currentMonth: categoryChanges reads the clock itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, transactions, homeCurrency, fxRate, currentMonth]
  )

  // Uncategorized expenses: the category list's own row, so the nudge's
  // numbers equal the rows its link opens.
  const uncategorizedSpend = useMemo(
    () =>
      categorySpending.find((row) => row.category === Category.Uncategorized),
    [categorySpending]
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

  // Monthly trend — last 12 months; partial months are drawn, not averaged.
  const monthlyTrend = useMemo(
    () =>
      buildMonthlyTrendRows(
        rows,
        homeCurrency,
        fxRate,
        currentMonth,
        transactions
      ),
    [rows, transactions, homeCurrency, fxRate, currentMonth]
  )

  // Opens exactly one month's rows (optionally only income or expenses), as
  // summed by the savings and monthly spend charts.
  const openMonth = openTransactions
    ? (key: string, type?: 'credit' | 'debit') => {
        const [y, m] = key.split('-').map(Number)
        openTransactions({
          period: { mode: 'month', y, m: m - 1 },
          ...(type && { type }),
        })
      }
    : undefined

  // Currency split
  const currencySplit = useMemo(
    () => buildCurrencySplit(rows, homeCurrency, fxRate),
    [rows, homeCurrency, fxRate]
  )

  // Top merchants — all history in home currency, grouped by the merchant
  // key the Transacciones merchant filter matches on.
  const topMerchants = useMemo(
    () =>
      buildMerchantSpendingConverted(rows, homeCurrency, fxRate).slice(0, 6),
    [rows, homeCurrency, fxRate]
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
    <div className="space-y-10">
      <PageHeader
        title={greeting}
        subtitle={
          <>
            Tus cuentas Santander de un vistazo
            {/* With data, the hero below names the month. */}
            {(!hasTransactions || allIgnored) && (
              <>
                {' · '}
                {todaySummary.monthLabel ||
                  latestDate.toLocaleDateString('es-UY', {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
              </>
            )}
          </>
        }
        actions={
          hasTransactions &&
          !allIgnored && (
            <>
              {onHouseholdModeChange && (
                <HouseholdModeToggle
                  householdMode={householdMode}
                  onChange={onHouseholdModeChange}
                />
              )}
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

      {noHouseholdSpend && !allIgnored && (
        <NoHouseholdState onNavigateToCategories={onNavigateToCategories} />
      )}

      {hasTransactions && !allIgnored && !noHouseholdSpend && (
        <>
          {/* Lead with what changed, before the totals. */}
          <CategoryChangesCard
            changes={changes}
            homeCurrency={homeCurrency}
            onOpen={openTransactions}
          />

          <MonthHero
            monthSummary={monthSummary}
            homeCurrency={homeCurrency}
            curWord={curWord}
            householdMode={householdMode}
            onNavigateToTransactions={openTransactions}
          />

          <ResumenSection
            title="¿A dónde se fue la plata?"
            period={periodRange}
          >
            <UncategorizedNudge
              uncategorizedSpend={uncategorizedSpend}
              homeCurrency={homeCurrency}
              onNavigateToTransactions={openTransactions}
            />
            <CategorySpendCard
              donutData={donutData}
              otherCategoryIds={otherCategoryIds}
              totalExpenses={totalExpenses}
              homeCurrency={homeCurrency}
              onNavigateToTransactions={openTransactions}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {topMerchants.length > 0 && (
                <TopMerchantsCard
                  topMerchants={topMerchants}
                  homeCurrency={homeCurrency}
                  onNavigateToTransactions={openTransactions}
                />
              )}
              <RecentTransactionsCard
                recentTransactions={recentTransactions}
                homeCurrency={homeCurrency}
                fxRate={fxRate}
                onNavigateToTransactions={openTransactions}
              />
            </div>
          </ResumenSection>

          {monthlyTrend.length > 0 && (
            <ResumenSection
              title="Mes a mes"
              period={`${
                monthlyTrend.length === 1
                  ? 'El único mes con datos'
                  : `Últimos ${monthlyTrend.length} meses con datos`
              } · combinado en ${curWord}`}
            >
              {!householdMode && (
                <SavingsCard
                  monthlyTrend={monthlyTrend}
                  homeCurrency={homeCurrency}
                  openMonth={openMonth}
                />
              )}
              <MonthlySpendChart
                monthlyTrend={monthlyTrend}
                homeCurrency={homeCurrency}
                openMonth={openMonth}
                showIncome={!householdMode}
              />
            </ResumenSection>
          )}

          {/* No section period: each account card shows its own. */}
          <ResumenSection title="Tus cuentas">
            <AccountCards
              acctSpend={acctSpend}
              homeCurrency={homeCurrency}
              onNavigateToTransactions={openTransactions}
            />
            {currencySplit.total > 0 && (
              <CurrencySplitCard
                currencySplit={currencySplit}
                homeCurrency={homeCurrency}
              />
            )}
          </ResumenSection>
        </>
      )}
    </div>
  )
}
