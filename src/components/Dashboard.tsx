// Dashboard - Overview with account cards and monthly summary

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
import { useMemo, useState } from 'react'
import { getCategoryDisplay } from '../utils/category-display'
import { isTransferCategory } from '../services/transfers/internal-transfers'
import {
  isCategoryIgnored,
  getCategoryDefinition,
} from '../services/categories/category-registry'

function toSafeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  const bars = values.slice(-6)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24 }}>
      {bars.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.round((v / max) * 100)}%`,
            minHeight: 3,
            background: color,
            borderRadius: 2,
            opacity: i === bars.length - 1 ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  )
}

function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(toSafeNumber(amount))
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount)
  const symbol = currency === 'UYU' ? '$U' : 'US$'
  return `${symbol} ${formatted}`
}

function calculateSummary(transactions: Transaction[], currency?: Currency) {
  const filtered = currency
    ? transactions.filter((tx) => tx.currency === currency)
    : transactions

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
  defaultCurrency?: Currency
}

type CurrencyFilter = Currency | 'all'

export function Dashboard({
  transactions,
  userName,
  onNavigateToImport,
  onNavigateToTransactions,
  onNavigateToAnalysis,
  defaultCurrency,
}: DashboardProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyFilter>(
    defaultCurrency ?? 'all'
  )

  const hasTransactions = transactions.length > 0

  // Reference month from latest transaction date — not current clock
  const latestDate = useMemo(() => {
    if (transactions.length === 0) return new Date()
    return transactions.reduce(
      (latest, tx) => (tx.date > latest ? tx.date : latest),
      transactions[0].date,
    )
  }, [transactions])

  const monthLabel = useMemo(
    () => latestDate.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' }),
    [latestDate],
  )

  const thisMonthTransactions = useMemo(() => {
    const y = latestDate.getFullYear()
    const m = latestDate.getMonth()
    return transactions.filter((tx) => {
      const d = tx.date
      return d.getFullYear() === y && d.getMonth() === m
    })
  }, [transactions, latestDate])

  // Per-source account summaries
  const creditCardTransactions = useMemo(
    () => transactions.filter((tx) => tx.source === 'credit_card'),
    [transactions],
  )
  const creditCardSummaryUYU = useMemo(
    () => calculateSummary(creditCardTransactions, 'UYU'),
    [creditCardTransactions],
  )
  const creditCardSummaryUSD = useMemo(
    () => calculateSummary(creditCardTransactions, 'USD'),
    [creditCardTransactions],
  )

  const usdBankTransactions = useMemo(
    () =>
      transactions.filter(
        (tx) => tx.source === 'bank_account' && tx.currency === 'USD',
      ),
    [transactions],
  )
  const usdBankSummary = useMemo(
    () => calculateSummary(usdBankTransactions, 'USD'),
    [usdBankTransactions],
  )

  const uyuBankTransactions = useMemo(
    () =>
      transactions.filter(
        (tx) => tx.source === 'bank_account' && tx.currency === 'UYU',
      ),
    [transactions],
  )
  const uyuBankSummary = useMemo(
    () => calculateSummary(uyuBankTransactions, 'UYU'),
    [uyuBankTransactions],
  )

  // "Este mes" panel summaries
  const thisMonthSummaryUYU = useMemo(
    () => calculateSummary(thisMonthTransactions, 'UYU'),
    [thisMonthTransactions],
  )
  const thisMonthSummaryUSD = useMemo(
    () => calculateSummary(thisMonthTransactions, 'USD'),
    [thisMonthTransactions],
  )

  const panelCurrency: Currency = selectedCurrency === 'USD' ? 'USD' : 'UYU'
  const panelSummary =
    selectedCurrency === 'USD' ? thisMonthSummaryUSD : thisMonthSummaryUYU

  // Top-5 category breakdown for selected currency (defaults to UYU in 'all' mode)
  const categoryBreakdown = useMemo(() => {
    const slice =
      selectedCurrency === 'USD'
        ? thisMonthTransactions.filter((tx) => tx.currency === 'USD')
        : thisMonthTransactions.filter((tx) => tx.currency === 'UYU')

    const debits = slice.filter(
      (tx) => tx.type === 'debit' && !isTransferCategory(tx.category) && !isCategoryIgnored(tx.category),
    )
    const total = debits.reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0)
    const byCategory = new Map<string, number>()
    debits.forEach((tx) => {
      const cat = tx.category ?? 'uncategorized'
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + toSafeNumber(tx.amount))
    })

    return Array.from(byCategory.entries())
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        display: getCategoryDisplay(cat),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [thisMonthTransactions, selectedCurrency])

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 6),
    [transactions],
  )

  const uyuMonthlyTrend = useMemo(() => {
    const grouped = new Map<string, { income: number; expense: number }>()
    transactions
      .filter(
        (tx) =>
          tx.currency === 'UYU' &&
          !isTransferCategory(tx.category) &&
          !isCategoryIgnored(tx.category),
      )
      .forEach((tx) => {
        const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
        if (!grouped.has(key)) grouped.set(key, { income: 0, expense: 0 })
        const entry = grouped.get(key)!
        if (tx.type === 'credit') entry.income += toSafeNumber(tx.amount)
        else entry.expense += toSafeNumber(tx.amount)
      })
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v)
      .slice(-6)
  }, [transactions])

  const firstName = userName ? userName.split('@')[0] : null
  const greeting = firstName ? `Hola, ${firstName} 👋` : 'Hola 👋'
  const summaryLabel =
    selectedCurrency === 'USD' ? 'Este mes en dólares' : 'Este mes en pesos'

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
            {greeting}
          </h1>
          <p
            className="text-muted-foreground"
            style={{ fontSize: 14 }}
          >
            Esto es lo que pasó en tus cuentas Santander · {monthLabel}
          </p>
        </div>
        {hasTransactions && (
          <div
            style={{
              display: 'flex',
              background: 'var(--surface-2)',
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
          >
            {(['all', 'UYU', 'USD'] as const).map((val) => (
              <button
                key={val}
                onClick={() => setSelectedCurrency(val)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  background:
                    selectedCurrency === val ? 'var(--bg)' : 'transparent',
                  color:
                    selectedCurrency === val
                      ? 'var(--text)'
                      : 'var(--text-faint)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow:
                    selectedCurrency === val
                      ? '0 1px 3px rgba(0,0,0,.08)'
                      : 'none',
                }}
              >
                {val === 'all' ? 'Todo' : val === 'UYU' ? '$U' : 'US$'}
              </button>
            ))}
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
          {/* 3 Account cards */}
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
                  <CreditCard size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Tarjeta de Crédito
                  </div>
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: 12 }}
                  >
                    Santander Mastercard
                  </div>
                </div>
              </div>
              <div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  Consumo del período
                </div>
                <div style={{ marginTop: 4 }}>
                  <div
                    className="font-mono"
                    style={{ fontSize: 22, color: 'var(--neg)' }}
                  >
                    {formatCurrency(creditCardSummaryUYU.expenses, 'UYU')}
                  </div>
                  {creditCardSummaryUSD.expenses > 0 && (
                    <div
                      className="font-mono text-muted-foreground"
                      style={{ fontSize: 14, marginTop: 2 }}
                    >
                      {formatCurrency(creditCardSummaryUSD.expenses, 'USD')}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="text-muted-foreground"
                style={{
                  fontSize: 12,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                {creditCardTransactions.length} movimientos este período
              </div>
            </Card>

            <Card
              className={onNavigateToTransactions ? 'p-5 cursor-pointer' : 'p-5'}
              onClick={
                onNavigateToTransactions
                  ? () =>
                      onNavigateToTransactions({
                        accountType: 'bank_account',
                        currency: 'USD',
                      })
                  : undefined
              }
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  <DollarSign size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Cuenta en Dólares
                  </div>
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: 12 }}
                  >
                    Caja de ahorro USD
                  </div>
                </div>
              </div>
              <div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  Saldo disponible
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 24,
                    marginTop: 4,
                    color:
                      usdBankSummary.balance >= 0 ? 'var(--text)' : 'var(--neg)',
                  }}
                >
                  {formatCurrency(usdBankSummary.balance, 'USD')}
                </div>
              </div>
              <div
                className="text-muted-foreground"
                style={{
                  fontSize: 12,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                {usdBankTransactions.length} movimientos este período
              </div>
            </Card>

            <Card
              className={onNavigateToTransactions ? 'p-5 cursor-pointer' : 'p-5'}
              onClick={
                onNavigateToTransactions
                  ? () =>
                      onNavigateToTransactions({
                        accountType: 'bank_account',
                        currency: 'UYU',
                      })
                  : undefined
              }
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                  <Landmark size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Cuenta en Pesos
                  </div>
                  <div
                    className="text-muted-foreground"
                    style={{ fontSize: 12 }}
                  >
                    Caja de ahorro UYU
                  </div>
                </div>
              </div>
              <div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  Saldo disponible
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 24,
                    marginTop: 4,
                    color:
                      uyuBankSummary.balance >= 0 ? 'var(--text)' : 'var(--neg)',
                  }}
                >
                  {formatCurrency(uyuBankSummary.balance, 'UYU')}
                </div>
              </div>
              <div
                className="text-muted-foreground"
                style={{
                  fontSize: 12,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                {uyuBankTransactions.length} movimientos este período
              </div>
            </Card>
          </div>

          {/* Este mes panel */}
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
                {summaryLabel}
              </h2>
              {onNavigateToAnalysis && (
                <button
                  onClick={onNavigateToAnalysis}
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
                  Ver análisis completo <ArrowRight size={14} />
                </button>
              )}
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
                  {formatCurrency(panelSummary.income, panelCurrency)}
                </div>
                {selectedCurrency === 'all' && thisMonthSummaryUSD.income > 0 && (
                  <div
                    className="font-mono text-muted-foreground"
                    style={{ fontSize: 13, marginTop: 2 }}
                  >
                    {formatCurrency(thisMonthSummaryUSD.income, 'USD')}
                  </div>
                )}
                {uyuMonthlyTrend.length > 1 && selectedCurrency !== 'USD' && (
                  <div style={{ marginTop: 12 }}>
                    <MiniBars
                      values={uyuMonthlyTrend.map((m) => m.income)}
                      color="var(--pos)"
                    />
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
                  style={{ fontSize: 22, color: 'var(--neg)' }}
                >
                  {formatCurrency(panelSummary.expenses, panelCurrency)}
                </div>
                {selectedCurrency === 'all' &&
                  thisMonthSummaryUSD.expenses > 0 && (
                    <div
                      className="font-mono text-muted-foreground"
                      style={{ fontSize: 13, marginTop: 2 }}
                    >
                      {formatCurrency(thisMonthSummaryUSD.expenses, 'USD')}
                    </div>
                  )}
                {uyuMonthlyTrend.length > 1 && selectedCurrency !== 'USD' && (
                  <div style={{ marginTop: 12 }}>
                    <MiniBars
                      values={uyuMonthlyTrend.map((m) => m.expense)}
                      color="var(--neg)"
                    />
                  </div>
                )}
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
                      panelSummary.balance >= 0 ? 'var(--pos)' : 'var(--neg)',
                  }}
                >
                  {panelSummary.balance >= 0 ? '+' : '−'}
                  {formatCurrency(Math.abs(panelSummary.balance), panelCurrency)}
                </div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, marginTop: 8 }}
                >
                  {thisMonthTransactions.length} transacciones registradas
                </div>
              </div>
            </div>
          </Card>

          {/* Two-column: categories + recent transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-6">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                }}
              >
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                  Gasto por categoría
                </h2>
                {onNavigateToAnalysis && (
                  <button
                    onClick={onNavigateToAnalysis}
                    style={{
                      fontSize: 13,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--brand)',
                      fontWeight: 500,
                    }}
                  >
                    Detalle
                  </button>
                )}
              </div>
              {categoryBreakdown.length === 0 ? (
                <p
                  className="text-muted-foreground"
                  style={{ fontSize: 13 }}
                >
                  Sin gastos registrados este mes.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {categoryBreakdown.map((row) => (
                    <div
                      key={row.category}
                      onClick={() =>
                        onNavigateToTransactions?.({ category: row.category })
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
                            gap: 7,
                            fontSize: 13.5,
                            fontWeight: 500,
                          }}
                        >
                          <span
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: 3,
                              background: row.display.color,
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                          {row.display.label}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: 13 }}
                        >
                          {formatCurrency(row.amount, panelCurrency)}
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
                            background: row.display.color,
                            borderRadius: 2,
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
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
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: catDef.color + '1f',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                          fontSize: 15,
                        }}
                      >
                        {catDef.icon}
                      </span>
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
                          {tx.description}
                        </div>
                        <div
                          className="text-muted-foreground"
                          style={{ fontSize: 11.5 }}
                        >
                          {tx.date.toLocaleDateString('es-UY', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </div>
                      </div>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 13.5,
                          color: isCredit ? 'var(--pos)' : 'var(--text)',
                          flexShrink: 0,
                        }}
                      >
                        {isCredit ? '+' : '−'}
                        {formatCurrency(tx.amount, tx.currency)}
                      </span>
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
