// Dashboard - Main overview with summary cards

import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  DollarSign,
} from 'lucide-react'
import {
  formatCurrency,
  calculateSummary,
  type Transaction,
  type Currency,
} from '../utils/data'
import { useState } from 'react'
import { Card } from '../components/ui/card'

interface DashboardProps {
  transactions: Transaction[]
}

export function Dashboard({ transactions }: DashboardProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | 'all'>(
    'all'
  )
  const [period, setPeriod] = useState('month')

  // Calculate summaries
  const allSummary = calculateSummary(transactions)
  const uyuSummary = calculateSummary(transactions, 'UYU')
  const usdSummary = calculateSummary(transactions, 'USD')

  const summary =
    selectedCurrency === 'all'
      ? allSummary
      : selectedCurrency === 'UYU'
        ? uyuSummary
        : usdSummary

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-2xl p-6 md:p-8 border border-primary/20">
        <h1 className="mb-2">Bienvenido a Tatú</h1>
        <p className="text-muted-foreground max-w-2xl">
          Tu gestor de gastos inteligente. Monitoreá tus finanzas, descubrí
          patrones de gasto y tomá decisiones informadas con datos de tus
          cuentas Santander Uruguay.
        </p>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="mb-1">Panel General</h2>
          <p className="text-muted-foreground">
            Resumen de tu actividad financiera
          </p>
        </div>

        <div className="flex gap-3">
          {/* Period Selector */}
          <select
            className="px-4 py-2 rounded-lg border border-input bg-input-background"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="quarter">Trimestre</option>
            <option value="year">Año 2024</option>
          </select>

          {/* Currency Filter */}
          <select
            className="px-4 py-2 rounded-lg border border-input bg-input-background"
            value={selectedCurrency}
            onChange={(e) =>
              setSelectedCurrency(e.target.value as Currency | 'all')
            }
          >
            <option value="all">Todas las monedas</option>
            <option value="UYU">Pesos (UYU)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Income Card */}
        <Card className="p-6 border-l-4 border-l-border">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg">
              <TrendingUp className="text-foreground" size={24} />
            </div>
            <span className="text-xs text-foreground px-2 py-1 rounded-full">
              +12.5%
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Ingresos</p>
            <p className="font-mono tracking-tight">
              {selectedCurrency === 'all' ? (
                <>
                  <span className="block">
                    {formatCurrency(uyuSummary.income, 'UYU')}
                  </span>
                  <span className="block text-muted-foreground">
                    {formatCurrency(usdSummary.income, 'USD')}
                  </span>
                </>
              ) : (
                formatCurrency(summary.income, selectedCurrency as Currency)
              )}
            </p>
          </div>
        </Card>

        {/* Expenses Card */}
        <Card className="p-6 border-l-4 border-l-[#ef4444]">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-[rgba(130,24,26,0.2)]">
              <TrendingDown className="text-[#ef4444]" size={24} />
            </div>
            <span className="text-xs text-[#ef4444] bg-[rgba(130,24,26,0.2)] px-2 py-1 rounded-full">
              -8.3%
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Gastos</p>
            <p className="font-mono tracking-tight">
              {selectedCurrency === 'all' ? (
                <>
                  <span className="block">
                    {formatCurrency(uyuSummary.expenses, 'UYU')}
                  </span>
                  <span className="block text-muted-foreground">
                    {formatCurrency(usdSummary.expenses, 'USD')}
                  </span>
                </>
              ) : (
                formatCurrency(summary.expenses, selectedCurrency as Currency)
              )}
            </p>
          </div>
        </Card>

        {/* Balance Card */}
        <Card className="p-6 border-l-4 border-l-[#30a3ff]">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg">
              <Wallet className="text-[#30a3ff]" size={24} />
            </div>
            <span className="text-xs text-[#30a3ff] px-2 py-1 rounded-full">
              Balance
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <p className="font-mono tracking-tight">
              {selectedCurrency === 'all' ? (
                <>
                  <span className="block">
                    {formatCurrency(uyuSummary.balance, 'UYU')}
                  </span>
                  <span className="block text-muted-foreground">
                    {formatCurrency(usdSummary.balance, 'USD')}
                  </span>
                </>
              ) : (
                formatCurrency(summary.balance, selectedCurrency as Currency)
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* Account Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20">
              <CreditCard className="text-accent" size={20} />
            </div>
            <div>
              <h4>Tarjeta de Crédito</h4>
              <p className="text-xs text-muted-foreground">
                Santander Mastercard
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Consumido</span>
              <span className="font-mono">{formatCurrency(45230, 'UYU')}</span>
            </div>
            <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div className="h-full bg-accent" style={{ width: '62%' }} />
            </div>
            <p className="text-xs text-muted-foreground">
              62% del límite disponible
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
              <DollarSign className="text-primary" size={20} />
            </div>
            <div>
              <h4>Cuenta en Dólares</h4>
              <p className="text-xs text-muted-foreground">
                Caja de ahorro USD
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">
                Saldo disponible
              </span>
              <span className="font-mono">
                {formatCurrency(usdSummary.balance, 'USD')}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-3">
              <span>≈ {formatCurrency(usdSummary.balance * 40, 'UYU')}</span>
              <span>TC: $U 40.00</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card className="p-6">
        <h4 className="mb-4">Estadísticas Rápidas</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Transacciones</p>
            <p className="font-mono">{summary.transactionCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Gasto promedio</p>
            <p className="font-mono">
              {selectedCurrency === 'all'
                ? formatCurrency(
                    summary.expenses / summary.transactionCount,
                    'UYU'
                  )
                : formatCurrency(
                    summary.expenses / summary.transactionCount,
                    selectedCurrency as Currency
                  )}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Mayor gasto</p>
            <p className="font-mono">{formatCurrency(8450, 'UYU')}</p>
            <p className="text-xs text-muted-foreground">Tienda Inglesa</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Categoría top</p>
            <p className="font-mono">Alimentación</p>
            <p className="text-xs text-muted-foreground">38% del total</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
