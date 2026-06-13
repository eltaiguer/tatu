// Dashboard - Main overview with summary cards

import { Card } from './ui/card';
import { Button } from './ui/button';
import { TrendingUp, TrendingDown, Wallet, CreditCard, DollarSign, Landmark, Upload, X } from 'lucide-react';
import type { Transaction, Currency, TransactionsFilter } from '../models';
import { useMemo, useState } from 'react';
import { filterByPeriod, generatePeriodOptions } from '../utils/date-utils';
import { getCategoryDisplay } from '../utils/category-display';
import { isTransferCategory } from '../services/transfers/internal-transfers';

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
    .filter((tx) => tx.type === 'credit' && !isTransferCategory(tx.category))
    .reduce((sum, tx) => sum + toSafeNumber(tx.amount), 0);

  const expenses = filtered
    .filter((tx) => tx.type === 'debit' && !isTransferCategory(tx.category))
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
    (tx) =>
      tx.type === 'debit' &&
      Number.isFinite(tx.amount) &&
      !isTransferCategory(tx.category)
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
    (tx) =>
      tx.type === 'debit' &&
      Number.isFinite(tx.amount) &&
      !isTransferCategory(tx.category)
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
  onNavigateToImport?: () => void;
  onNavigateToTransactions?: (filter: TransactionsFilter) => void;
}

export function Dashboard({ transactions, onNavigateToImport, onNavigateToTransactions }: DashboardProps) {
  const selectedCurrency: Currency | 'all' = 'all'
  const selectedPeriodId = 'all'

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

  const debitCount = currencyFilteredTransactions.filter(
    (tx) => tx.type === 'debit' && !isTransferCategory(tx.category)
  ).length;
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

  const usdBankTransactions = useMemo(
    () => filteredTransactions.filter((tx) => tx.source === 'bank_account' && tx.currency === 'USD'),
    [filteredTransactions]
  )
  const usdBankSummary = useMemo(
    () => calculateSummary(usdBankTransactions, 'USD'),
    [usdBankTransactions]
  )

  const uyuBankTransactions = useMemo(
    () => filteredTransactions.filter((tx) => tx.source === 'bank_account' && tx.currency === 'UYU'),
    [filteredTransactions]
  );
  const uyuBankSummary = useMemo(
    () => calculateSummary(uyuBankTransactions, 'UYU'),
    [uyuBankTransactions]
  );

  const hasTransactions = transactions.length > 0;

  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('tatu:welcomeBannerDismissed') === 'true'
  )

  function dismissBanner() {
    localStorage.setItem('tatu:welcomeBannerDismissed', 'true')
    setBannerDismissed(true)
  }

  return (
    <div className="space-y-6">
      {!bannerDismissed && (
        <div className="relative bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-2xl p-6 md:p-8 border border-primary/20">
          <button
            onClick={dismissBanner}
            aria-label="Cerrar bienvenida"
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
          <h1 className="mb-2">Bienvenido a Tatú</h1>
          <p className="text-muted-foreground max-w-2xl">
            Tu gestor de gastos inteligente. Monitoreá tus finanzas, descubrí patrones de gasto y
            tomá decisiones informadas con datos de tus cuentas Santander Uruguay.
          </p>
        </div>
      )}

      {!hasTransactions && (
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Empezá importando tu extracto</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Arrastrá tu archivo CSV de Santander Uruguay para ver tu dashboard con ingresos, gastos y estadísticas.
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

      {hasTransactions && (<>
      <div>
        <h2 className="mb-1">Panel General</h2>
        <p className="text-muted-foreground">Resumen de tu actividad financiera</p>
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
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className={`p-6${onNavigateToTransactions ? ' cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all' : ''}`}
          onClick={onNavigateToTransactions ? () => onNavigateToTransactions({ accountType: 'credit_card' }) : undefined}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20">
              <CreditCard className="text-accent" size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold">Tarjeta de Crédito</h3>
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

        <Card
          className={`p-6${onNavigateToTransactions ? ' cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all' : ''}`}
          onClick={onNavigateToTransactions ? () => onNavigateToTransactions({ accountType: 'bank_account', currency: 'USD' }) : undefined}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
              <DollarSign className="text-primary" size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold">Cuenta en Dólares</h3>
              <p className="text-xs text-muted-foreground">Caja de ahorro USD</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Saldo disponible</span>
              <span className="font-mono">{formatCurrency(usdBankSummary.balance, 'USD')}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-3">
              <span>{usdBankTransactions.length} movimientos USD</span>
              <span>{filteredTransactions.length} totales</span>
            </div>
          </div>
        </Card>

        <Card
          className={`p-6${onNavigateToTransactions ? ' cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all' : ''}`}
          onClick={onNavigateToTransactions ? () => onNavigateToTransactions({ accountType: 'bank_account', currency: 'UYU' }) : undefined}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-success-50 dark:bg-success-900/20">
              <Landmark className="text-success-600" size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold">Cuenta en Pesos</h3>
              <p className="text-xs text-muted-foreground">Caja de ahorro UYU</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-muted-foreground">Saldo disponible</span>
              <span className="font-mono">{formatCurrency(uyuBankSummary.balance, 'UYU')}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-3">
              <span>{uyuBankTransactions.length} movimientos UYU</span>
              <span>{filteredTransactions.length} totales</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="mb-4">Estadísticas Rápidas</h3>
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
          <div
            className={onNavigateToTransactions && topCategory ? 'cursor-pointer group' : ''}
            onClick={onNavigateToTransactions && topCategory ? () => onNavigateToTransactions({ category: topCategory.category }) : undefined}
          >
            <p className="text-sm text-muted-foreground mb-1">Categoría top</p>
            <p className={`font-mono${onNavigateToTransactions && topCategory ? ' group-hover:text-primary transition-colors' : ''}`}>
              {topCategoryDisplay.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {topCategory ? `${topCategory.percentage.toFixed(1)}% del total` : '0.0% del total'}
            </p>
          </div>
        </div>
      </Card>
      </>)}
    </div>
  );
}
