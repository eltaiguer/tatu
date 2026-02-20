// Dashboard - Main overview with summary cards

import { Card } from './ui/card';
import { TrendingUp, TrendingDown, Wallet, CreditCard, DollarSign } from 'lucide-react';
import type { Transaction, Currency } from '../models';
import { useMemo, useState } from 'react';
import { filterByPeriod, generatePeriodOptions } from '../utils/date-utils';
import { getCategoryDisplay } from '../utils/category-display';

function toSafeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(toSafeNumber(amount));
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);

  const symbol = currency === 'UYU' ? '$U' : 'US$';
  return `${symbol} ${formatted}`;
}

function calculateSummary(transactions: Transaction[], currency?: Currency) {
  const filtered = currency
    ? transactions.filter((tx) => tx.currency === currency)
    : transactions;

  const income = filtered
    .filter((tx) => tx.type === 'credit')
    .reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0);

  const expenses = filtered
    .filter((tx) => tx.type === 'debit')
    .reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0);

  return {
    income: toSafeNumber(income),
    expenses: toSafeNumber(expenses),
    balance: toSafeNumber(income - expenses),
    transactionCount: filtered.length,
  };
}

function findTopExpense(transactions: Transaction[]): Transaction | null {
  const debits = transactions.filter(
    (tx) => tx.type === 'debit' && Number.isFinite(tx.amount)
  );

  if (debits.length === 0) {
    return null;
  }

  return debits.reduce((max, tx) => (tx.amount > max.amount ? tx : max), debits[0]);
}

function getTopCategory(transactions: Transaction[]): {
  category: string;
  amount: number;
  percentage: number;
} | null {
  const debits = transactions.filter(
    (tx) => tx.type === 'debit' && Number.isFinite(tx.amount)
  );

  if (debits.length === 0) {
    return null;
  }

  const totals = new Map<string, number>();
  debits.forEach((tx) => {
    const category = tx.category ?? 'uncategorized';
    totals.set(category, (totals.get(category) ?? 0) + toSafeNumber(tx.amount));
  });

  let top = { category: 'uncategorized', amount: 0 };
  totals.forEach((amount, category) => {
    if (amount > top.amount) {
      top = { category, amount };
    }
  });

  const totalAmount = debits.reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0);
  const percentage = totalAmount > 0 ? (top.amount / totalAmount) * 100 : 0;

  return {
    category: top.category,
    amount: top.amount,
    percentage,
  };
}

interface DashboardProps {
  transactions: Transaction[];
}

export function Dashboard({ transactions }: DashboardProps) {
  const [selectedCurrency, setSelectedCurrency] = useState<Currency | 'all'>('all');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('all');

  const periodOptions = useMemo(() => {
    const dates = transactions.map((tx) => tx.date);
    return generatePeriodOptions(dates);
  }, [transactions]);

  const selectedPeriod = useMemo(
    () => periodOptions.find((option) => option.id === selectedPeriodId) || periodOptions[0],
    [periodOptions, selectedPeriodId]
  );

  const filteredTransactions = useMemo(() => {
    if (!selectedPeriod) {
      return transactions;
    }

    return filterByPeriod(
      transactions,
      'date',
      selectedPeriod.period,
      selectedPeriod.referenceDate
    );
  }, [transactions, selectedPeriod]);

  const allSummary = useMemo(
    () => calculateSummary(filteredTransactions),
    [filteredTransactions]
  );
  const uyuSummary = useMemo(
    () => calculateSummary(filteredTransactions, 'UYU'),
    [filteredTransactions]
  );
  const usdSummary = useMemo(
    () => calculateSummary(filteredTransactions, 'USD'),
    [filteredTransactions]
  );

  const currencyFilteredTransactions = useMemo(
    () =>
      selectedCurrency === 'all'
        ? filteredTransactions
        : filteredTransactions.filter((tx) => tx.currency === selectedCurrency),
    [filteredTransactions, selectedCurrency]
  );

  const summary = selectedCurrency === 'all'
    ? allSummary
    : selectedCurrency === 'UYU'
      ? uyuSummary
      : usdSummary;

  const debitCount = currencyFilteredTransactions.filter((tx) => tx.type === 'debit').length;
  const averageExpense = debitCount > 0 ? summary.expenses / debitCount : 0;
  const currencyLabel = selectedCurrency === 'all' ? 'multimoneda' : selectedCurrency;

  const topExpense = useMemo(
    () => findTopExpense(currencyFilteredTransactions),
    [currencyFilteredTransactions]
  );
  const topCategory = useMemo(
    () => getTopCategory(currencyFilteredTransactions),
    [currencyFilteredTransactions]
  );
  const topCategoryDisplay = topCategory
    ? getCategoryDisplay(topCategory.category)
    : getCategoryDisplay();

  const creditCardTransactions = useMemo(
    () => filteredTransactions.filter((tx) => tx.source === 'credit_card'),
    [filteredTransactions]
  );
  const creditCardSummary = useMemo(
    () => calculateSummary(creditCardTransactions),
    [creditCardTransactions]
  );
  const creditCardSummaryUYU = useMemo(
    () => calculateSummary(creditCardTransactions, 'UYU'),
    [creditCardTransactions]
  );
  const creditCardSummaryUSD = useMemo(
    () => calculateSummary(creditCardTransactions, 'USD'),
    [creditCardTransactions]
  );

  const usdTransactionsCount = filteredTransactions.filter(
    (tx) => tx.currency === 'USD'
  ).length;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-2xl p-6 md:p-8 border border-primary/20">
        <h1 className="mb-2">Bienvenido a Tatú</h1>
        <p className="text-muted-foreground max-w-2xl">
          Tu gestor de gastos inteligente. Monitoreá tus finanzas, descubrí patrones de gasto y
          tomá decisiones informadas con datos de tus cuentas Santander Uruguay.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="mb-1">Panel General</h2>
          <p className="text-muted-foreground">Resumen de tu actividad financiera</p>
        </div>

        <div className="flex gap-3">
          <select
            aria-label="Período"
            className="px-4 py-2 rounded-lg border border-input bg-input-background"
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
          >
            {periodOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Moneda"
            className="px-4 py-2 rounded-lg border border-input bg-input-background"
            value={selectedCurrency}
            onChange={(event) => setSelectedCurrency(event.target.value as Currency | 'all')}
          >
            <option value="all">Todas las monedas</option>
            <option value="UYU">Pesos (UYU)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 border-l-4 border-l-success-500">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-success-50 dark:bg-success-900/20">
              <TrendingUp className="text-success-600" size={24} />
            </div>
            <span className="text-xs text-success-600 bg-success-50 dark:bg-success-900/20 px-2 py-1 rounded-full">
              {currencyLabel}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Ingresos</p>
            <p className="font-mono tracking-tight">
              {selectedCurrency === 'all' ? (
                <>
                  <span className="block">{formatCurrency(uyuSummary.income, 'UYU')}</span>
                  <span className="block text-muted-foreground">{formatCurrency(usdSummary.income, 'USD')}</span>
                </>
              ) : (
                formatCurrency(summary.income, selectedCurrency as Currency)
              )}
            </p>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-destructive">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
              <TrendingDown className="text-destructive" size={24} />
            </div>
            <span className="text-xs text-destructive bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full">
              {debitCount} débitos
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Gastos</p>
            <p className="font-mono tracking-tight">
              {selectedCurrency === 'all' ? (
                <>
                  <span className="block">{formatCurrency(uyuSummary.expenses, 'UYU')}</span>
                  <span className="block text-muted-foreground">{formatCurrency(usdSummary.expenses, 'USD')}</span>
                </>
              ) : (
                formatCurrency(summary.expenses, selectedCurrency as Currency)
              )}
            </p>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-primary">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
              <Wallet className="text-primary" size={24} />
            </div>
            <span className="text-xs text-primary bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-full">
              Balance
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <p className="font-mono tracking-tight">
              {selectedCurrency === 'all' ? (
                <>
                  <span className="block">{formatCurrency(uyuSummary.balance, 'UYU')}</span>
                  <span className="block text-muted-foreground">{formatCurrency(usdSummary.balance, 'USD')}</span>
                </>
              ) : (
                formatCurrency(summary.balance, selectedCurrency as Currency)
              )}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20">
              <CreditCard className="text-accent" size={20} />
            </div>
            <div>
              <h4>Tarjeta de Crédito</h4>
              <p className="text-xs text-muted-foreground">Santander Mastercard</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Consumido</span>
              <div className="font-mono text-right">
                {selectedCurrency === 'all' ? (
                  <>
                    <span className="block">
                      {formatCurrency(creditCardSummaryUYU.expenses, 'UYU')}
                    </span>
                    <span className="block text-muted-foreground">
                      {formatCurrency(creditCardSummaryUSD.expenses, 'USD')}
                    </span>
                  </>
                ) : (
                  formatCurrency(creditCardSummary.expenses, selectedCurrency as Currency)
                )}
              </div>
            </div>
            {selectedCurrency === 'all' && (
              <div className="flex justify-between text-xs text-muted-foreground mt-3">
                <span>{creditCardSummary.transactionCount} movimientos</span>
                <span>{debitCount} débitos totales</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
              <DollarSign className="text-primary" size={20} />
            </div>
            <div>
              <h4>Cuenta en Dólares</h4>
              <p className="text-xs text-muted-foreground">Caja de ahorro USD</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Saldo disponible</span>
              <span className="font-mono">{formatCurrency(usdSummary.balance, 'USD')}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-3">
              <span>{usdTransactionsCount} movimientos USD</span>
              <span>{filteredTransactions.length} totales</span>
            </div>
          </div>
        </Card>
      </div>

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
                ? formatCurrency(averageExpense, 'UYU')
                : formatCurrency(averageExpense, selectedCurrency as Currency)
              }
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Mayor gasto</p>
            <p className="font-mono">
              {topExpense
                ? formatCurrency(topExpense.amount, topExpense.currency)
                : formatCurrency(0, selectedCurrency === 'all' ? 'UYU' : selectedCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {topExpense?.description || 'Sin movimientos en el período'}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Categoría top</p>
            <p className="font-mono">{topCategoryDisplay.label}</p>
            <p className="text-xs text-muted-foreground">
              {topCategory ? `${topCategory.percentage.toFixed(1)}% del total` : '0.0% del total'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
