// Dashboard - Overview with account cards, converted+combined monthly summary

import { Card } from './ui/card'
import { Button } from './ui/button'
import { Upload, ArrowRight } from 'lucide-react'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { useMemo } from 'react'
import { getCategoryDisplay } from '../utils/category-display'
import { getCategoryDefinition } from '../services/categories/category-registry'
import {
  buildCurrentMonthSummary,
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
} from '../services/charts/chart-data'
import { convert } from '../services/currency/convert'
import { FxChip } from './FxChip'
import { CurrencyToggle } from './CurrencyToggle'
import { formatCurrency, formatDateCompact } from '../utils/formatting'
import { IconTile } from './ui/icon-tile'
import { getDisplayDescription } from '../utils/transaction-display'
import { CategoryBreakdownList } from './CategoryBreakdownList'
import type { CategoryBreakdownRow } from './CategoryBreakdownList'

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


interface DashboardProps {
  transactions: Transaction[]
  userName?: string
  onNavigateToImport?: () => void
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  onNavigateToAnalysis?: () => void
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
  onNavigateToAnalysis,
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

  // "Este mes" — converted + combined totals in home currency
  const monthSummary = useMemo(
    () => buildCurrentMonthSummary(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate],
  )

  // Category breakdown for current month, in home currency
  const thisMonthTransactions = useMemo(() => {
    const y = latestDate.getUTCFullYear()
    const m = latestDate.getUTCMonth()
    return transactions.filter(
      (tx) => tx.date.getUTCFullYear() === y && tx.date.getUTCMonth() === m,
    )
  }, [transactions, latestDate])

  const categoryBreakdown = useMemo(() => {
    const data = buildCategorySpendingConverted(
      thisMonthTransactions,
      homeCurrency,
      fxRate,
    )
    const total = data.reduce((s, r) => s + r.total, 0) || 1
    return data.slice(0, 5).map((row) => ({
      ...row,
      pct: (row.total / total) * 100,
      display: getCategoryDisplay(row.category),
    }))
  }, [thisMonthTransactions, homeCurrency, fxRate])

  // Monthly sparkline trend (converted+combined for home currency)
  const monthlyTrend = useMemo(
    () => buildMonthlyTrendsConverted(transactions, homeCurrency, fxRate).slice(-6),
    [transactions, homeCurrency, fxRate],
  )

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 6),
    [transactions],
  )

  const greeting = userName ? `Hola, ${userName} 👋` : 'Hola 👋'

  const categoryBreakdownRows: CategoryBreakdownRow[] = categoryBreakdown.map(
    (row) => ({
      id: row.category,
      label: row.display.label,
      color: row.display.color,
      amount: row.total,
      pct: row.pct,
    }),
  )

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
          <h1 style={{ marginBottom: 4 }}>
            {greeting}
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            Esto es lo que pasó en tus cuentas · {monthSummary.monthLabel || latestDate.toLocaleDateString('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
        {hasTransactions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
          {/* Este mes panel — converted + combined in home currency */}
          <Card className="p-6">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, fontFamily: 'var(--font-sans)' }}>
                  Este mes, todo en{' '}
                  {homeCurrency === 'USD' ? 'dólares' : 'pesos'}
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
              {onNavigateToAnalysis && (
                <button
                  onClick={onNavigateToAnalysis}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 13, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--brand)', fontWeight: 500,
                  }}
                >
                  Ver análisis completo <ArrowRight size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Ingresos
                </div>
                <div className="font-mono" style={{ fontSize: 22, color: 'var(--pos)' }}>
                  {formatCurrency(monthSummary.income, homeCurrency)}
                </div>
                {monthlyTrend.length > 1 && (
                  <div style={{ marginTop: 12 }}>
                    <MiniBars values={monthlyTrend.map((m) => m.income)} color="var(--pos)" />
                  </div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Gastos
                </div>
                <div className="font-mono" style={{ fontSize: 22, color: 'var(--neg)' }}>
                  {formatCurrency(monthSummary.expense, homeCurrency)}
                </div>
                {homeCurrency === 'USD' && monthSummary.split.UYU > 0 && (
                  <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4 }}>
                    {formatCurrency(monthSummary.split.USD, 'USD')} +{' '}
                    {formatCurrency(monthSummary.split.UYU, 'UYU')}
                  </div>
                )}
                {homeCurrency === 'UYU' && monthSummary.split.USD > 0 && (
                  <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4 }}>
                    {formatCurrency(monthSummary.split.UYU, 'UYU')} +{' '}
                    {formatCurrency(monthSummary.split.USD, 'USD')}
                  </div>
                )}
              </div>
              <div>
                <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  Balance neto
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 22, color: monthSummary.net >= 0 ? 'var(--pos)' : 'var(--neg)' }}
                >
                  {monthSummary.net >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(monthSummary.net), homeCurrency)}
                </div>
                <div className="text-muted-foreground" style={{ fontSize: 12, marginTop: 8 }}>
                  {monthSummary.count} transacciones registradas
                </div>
              </div>
            </div>
          </Card>

          {/* Two-column: categories + recent transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-6">
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 18,
                }}
              >
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, fontFamily: 'var(--font-sans)' }}>
                  Gasto por categoría
                </h2>
                {onNavigateToAnalysis && (
                  <button
                    onClick={onNavigateToAnalysis}
                    style={{
                      fontSize: 13, background: 'none', border: 'none',
                      cursor: 'pointer', color: 'var(--brand)', fontWeight: 500,
                    }}
                  >
                    Detalle
                  </button>
                )}
              </div>
              {categoryBreakdownRows.length === 0 ? (
                <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                  Sin gastos registrados este mes.
                </p>
              ) : (
                <CategoryBreakdownList
                  rows={categoryBreakdownRows}
                  currency={homeCurrency}
                  onClickRow={
                    onNavigateToTransactions
                      ? (id) => onNavigateToTransactions({ category: id })
                      : undefined
                  }
                />
              )}
            </Card>

            <Card className="p-6">
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: 14,
                }}
              >
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, fontFamily: 'var(--font-sans)' }}>
                  Movimientos recientes
                </h2>
                {onNavigateToTransactions && (
                  <button
                    onClick={() => onNavigateToTransactions({})}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 13, background: 'none', border: 'none',
                      cursor: 'pointer', color: 'var(--brand)', fontWeight: 500,
                    }}
                  >
                    Ver todos <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recentTransactions.map((tx, i) => {
                  const catDef = getCategoryDefinition(tx.category ?? 'uncategorized')
                  const isCredit = tx.type === 'credit'
                  const showConverted = tx.currency !== homeCurrency
                  const convertedAmt = showConverted
                    ? convert(tx.amount, tx.currency, homeCurrency, fxRate)
                    : null
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 0',
                        borderBottom: i < recentTransactions.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <IconTile size="md" color={catDef.color}>
                        {catDef.icon}
                      </IconTile>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13.5, fontWeight: 500,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          {getDisplayDescription(tx)}
                        </div>
                        <div className="text-muted-foreground" style={{ fontSize: 11.5 }}>
                          {formatDateCompact(tx.date)}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span
                          className="font-mono"
                          style={{ fontSize: 13.5, color: isCredit ? 'var(--pos)' : 'var(--text)', display: 'block' }}
                        >
                          {isCredit ? '+' : '−'}
                          {formatCurrency(tx.amount, tx.currency)}
                        </span>
                        {showConverted && convertedAmt !== null && Math.abs(convertedAmt) >= 0.005 && (
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
          </div>
        </>
      )}
    </div>
  )
}
