// Dashboard - Overview with account cards, converted+combined monthly summary

import { Card } from './ui/card'
import { Button } from './ui/button'
import {
  CreditCard,
  DollarSign,
  Landmark,
  Upload,
  ArrowRight,
} from 'lucide-react'
import type { Transaction, Currency, TransactionsFilter } from '../models'
import { useMemo } from 'react'
import { getCategoryDisplay } from '../utils/category-display'
import { isTransferCategory } from '../services/transfers/internal-transfers'
import { isCategoryIgnored, getCategoryDefinition } from '../services/categories/category-registry'
import {
  buildCurrentMonthSummary,
  buildCategorySpendingConverted,
  buildMonthlyTrendsConverted,
} from '../services/charts/chart-data'
import { convert } from '../services/currency/convert'
import { FxChip } from './FxChip'
import { formatCurrency, toSafeNumber } from '../utils/formatting'
import { getDisplayDescription } from '../utils/transaction-display'

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

function calculateAccountSummary(transactions: Transaction[], currency: Currency) {
  const filtered = transactions.filter((tx) => tx.currency === currency)
  const income = filtered
    .filter((tx) => tx.type === 'credit' && !isTransferCategory(tx.category) && !isCategoryIgnored(tx.category))
    .reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0)
  const expenses = filtered
    .filter((tx) => tx.type === 'debit' && !isTransferCategory(tx.category) && !isCategoryIgnored(tx.category))
    .reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0)
  return {
    income: toSafeNumber(income),
    expenses: toSafeNumber(expenses),
    balance: toSafeNumber(income - expenses),
    transactionCount: filtered.length,
  }
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

  // Per-source account summaries (native currency, not converted)
  const creditCardTransactions = useMemo(
    () => transactions.filter((tx) => tx.source === 'credit_card'),
    [transactions],
  )
  const creditCardSummaryUYU = useMemo(
    () => calculateAccountSummary(creditCardTransactions, 'UYU'),
    [creditCardTransactions],
  )
  const creditCardSummaryUSD = useMemo(
    () => calculateAccountSummary(creditCardTransactions, 'USD'),
    [creditCardTransactions],
  )
  const usdBankTransactions = useMemo(
    () => transactions.filter((tx) => tx.source === 'bank_account' && tx.currency === 'USD'),
    [transactions],
  )
  const usdBankSummary = useMemo(
    () => calculateAccountSummary(usdBankTransactions, 'USD'),
    [usdBankTransactions],
  )
  const uyuBankTransactions = useMemo(
    () => transactions.filter((tx) => tx.source === 'bank_account' && tx.currency === 'UYU'),
    [transactions],
  )
  const uyuBankSummary = useMemo(
    () => calculateAccountSummary(uyuBankTransactions, 'UYU'),
    [uyuBankTransactions],
  )

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

  const firstName = userName ? userName.split('@')[0] : null
  const greeting = firstName ? `Hola, ${firstName} 👋` : 'Hola 👋'

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
            Esto es lo que pasó en tus cuentas Santander · {monthSummary.monthLabel || latestDate.toLocaleDateString('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
        {hasTransactions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <FxChip fxRate={fxRate} onSetFxRate={onSetFxRate} />
            <div
              style={{
                display: 'flex',
                background: 'var(--surface-2)',
                borderRadius: 10,
                padding: 3,
                gap: 2,
              }}
            >
              {(['USD', 'UYU'] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => onSetHomeCurrency?.(val)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 500,
                    background: homeCurrency === val ? 'var(--bg)' : 'transparent',
                    color: homeCurrency === val ? 'var(--text)' : 'var(--text-faint)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: homeCurrency === val ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                  }}
                >
                  {val === 'USD' ? 'US$' : '$U'}
                </button>
              ))}
            </div>
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
          {/* 3 Account cards (native amounts) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              className={onNavigateToTransactions ? 'p-5 cursor-pointer' : 'p-5'}
              onClick={
                onNavigateToTransactions
                  ? () => onNavigateToTransactions({ accountType: 'credit_card' })
                  : undefined
              }
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--surface-2)', color: 'var(--brand)',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}
                >
                  <CreditCard size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Tarjeta de Crédito</div>
                  {(() => {
                    const raw = creditCardTransactions[0]?.rawData as
                      | { numeroTarjeta?: string }
                      | undefined
                    const last4 = raw?.numeroTarjeta?.split('-').pop()
                    return (
                      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                        Tarjeta de crédito{last4 ? ` ·· ${last4}` : ''}
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                  Consumo del período
                </div>
                <div style={{ marginTop: 4 }}>
                  <div className="font-mono" style={{ fontSize: 22, color: 'var(--neg)' }}>
                    {formatCurrency(creditCardSummaryUYU.expenses, 'UYU')}
                  </div>
                  {creditCardSummaryUSD.expenses > 0 && (
                    <div className="font-mono text-muted-foreground" style={{ fontSize: 14, marginTop: 2 }}>
                      {formatCurrency(creditCardSummaryUSD.expenses, 'USD')}
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-faint)',
                }}
              >
                <span>{creditCardTransactions.length} movimientos</span>
                <span className="font-mono">
                  ≈{' '}
                  {formatCurrency(
                    convert(
                      creditCardSummaryUYU.expenses,
                      'UYU',
                      homeCurrency,
                      fxRate,
                    ) +
                      convert(
                        creditCardSummaryUSD.expenses,
                        'USD',
                        homeCurrency,
                        fxRate,
                      ),
                    homeCurrency,
                  )}
                </span>
              </div>
            </Card>

            <Card
              className={onNavigateToTransactions ? 'p-5 cursor-pointer' : 'p-5'}
              onClick={
                onNavigateToTransactions
                  ? () => onNavigateToTransactions({ accountType: 'bank_account', currency: 'USD' })
                  : undefined
              }
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--surface-2)', color: 'var(--brand)',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}
                >
                  <DollarSign size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Cuenta en Dólares</div>
                  <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                    Caja de ahorro USD
                  </div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                  Saldo disponible
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 24, marginTop: 4, color: usdBankSummary.balance >= 0 ? 'var(--text)' : 'var(--neg)' }}
                >
                  {formatCurrency(usdBankSummary.balance, 'USD')}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-faint)',
                }}
              >
                <span>{usdBankTransactions.length} movimientos</span>
                <span className="font-mono">
                  ≈{' '}
                  {formatCurrency(
                    convert(usdBankSummary.expenses, 'USD', homeCurrency, fxRate),
                    homeCurrency,
                  )}
                </span>
              </div>
            </Card>

            <Card
              className={onNavigateToTransactions ? 'p-5 cursor-pointer' : 'p-5'}
              onClick={
                onNavigateToTransactions
                  ? () => onNavigateToTransactions({ accountType: 'bank_account', currency: 'UYU' })
                  : undefined
              }
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--surface-2)', color: 'var(--brand)',
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}
                >
                  <Landmark size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Cuenta en Pesos</div>
                  <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                    Caja de ahorro UYU
                  </div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground" style={{ fontSize: 12, fontWeight: 500 }}>
                  Saldo disponible
                </div>
                <div
                  className="font-mono"
                  style={{ fontSize: 24, marginTop: 4, color: uyuBankSummary.balance >= 0 ? 'var(--text)' : 'var(--neg)' }}
                >
                  {formatCurrency(uyuBankSummary.balance, 'UYU')}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-faint)',
                }}
              >
                <span>{uyuBankTransactions.length} movimientos</span>
                <span className="font-mono">
                  ≈{' '}
                  {formatCurrency(
                    convert(uyuBankSummary.expenses, 'UYU', homeCurrency, fxRate),
                    homeCurrency,
                  )}
                </span>
              </div>
            </Card>
          </div>

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
              {categoryBreakdown.length === 0 ? (
                <p className="text-muted-foreground" style={{ fontSize: 13 }}>
                  Sin gastos registrados este mes.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {categoryBreakdown.map((row) => (
                    <div
                      key={row.category}
                      onClick={() => onNavigateToTransactions?.({ category: row.category })}
                      style={{ cursor: onNavigateToTransactions ? 'pointer' : 'default' }}
                    >
                      <div
                        style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'baseline', marginBottom: 5,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            gap: 7, fontSize: 13.5, fontWeight: 500,
                          }}
                        >
                          <span
                            style={{
                              width: 9, height: 9, borderRadius: 3,
                              background: row.display.color, display: 'inline-block', flexShrink: 0,
                            }}
                          />
                          {row.display.label}
                        </span>
                        <span className="font-mono" style={{ fontSize: 13 }}>
                          {formatCurrency(row.total, homeCurrency)}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%', width: `${row.pct}%`,
                            background: row.display.color, borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
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
                      <span
                        style={{
                          width: 32, height: 32, borderRadius: 9,
                          background: catDef.color + '1f',
                          display: 'grid', placeItems: 'center',
                          flexShrink: 0, fontSize: 15,
                        }}
                      >
                        {catDef.icon}
                      </span>
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
                          {tx.date.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' })}
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
                        {showConverted && convertedAmt !== null && (
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
