// Tatu - Sample data and utilities for Uruguayan expense tracker

export type Currency = 'UYU' | 'USD';
export type AccountType = 'credit_card' | 'usd_account' | 'uyu_account';

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  merchant: string;
  amount: number;
  currency: Currency;
  category: string;
  accountType: AccountType;
  autoCategory?: string;
  confidence?: number; // 0-1 for auto-categorization confidence
  manualOverride?: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income';
}

// Uruguayan merchants for realistic data
export const uruguayanMerchants = [
  { name: 'Devoto', category: 'food', type: 'supermarket' },
  { name: 'Tienda Inglesa', category: 'food', type: 'supermarket' },
  { name: 'Disco', category: 'food', type: 'supermarket' },
  { name: 'Geant', category: 'food', type: 'supermarket' },
  { name: 'Ta-Ta', category: 'food', type: 'supermarket' },
  { name: 'Farmashop', category: 'health', type: 'pharmacy' },
  { name: 'Farmacia Montevideo', category: 'health', type: 'pharmacy' },
  { name: 'UTE', category: 'utilities', type: 'electricity' },
  { name: 'OSE', category: 'utilities', type: 'water' },
  { name: 'Antel', category: 'utilities', type: 'telecom' },
  { name: 'Movistar', category: 'utilities', type: 'mobile' },
  { name: 'Claro', category: 'utilities', type: 'mobile' },
  { name: 'Abitab', category: 'transport', type: 'payment' },
  { name: 'RedPagos', category: 'transport', type: 'payment' },
  { name: 'STM', category: 'transport', type: 'bus' },
  { name: 'Copsa', category: 'transport', type: 'bus' },
  { name: 'Cutcsa', category: 'transport', type: 'bus' },
  { name: 'Ancap', category: 'transport', type: 'fuel' },
  { name: 'Esso', category: 'transport', type: 'fuel' },
  { name: 'Petrobras', category: 'transport', type: 'fuel' },
  { name: 'PedidosYa', category: 'food', type: 'delivery' },
  { name: 'Rappi', category: 'food', type: 'delivery' },
  { name: 'Mercado Libre', category: 'shopping', type: 'marketplace' },
  { name: 'Zara', category: 'shopping', type: 'clothing' },
  { name: 'H&M', category: 'shopping', type: 'clothing' },
  { name: 'Nike', category: 'shopping', type: 'sports' },
  { name: 'Adidas', category: 'shopping', type: 'sports' },
  { name: 'Movie', category: 'entertainment', type: 'cinema' },
  { name: 'Life Cinemas', category: 'entertainment', type: 'cinema' },
  { name: 'Spotify', category: 'entertainment', type: 'streaming' },
  { name: 'Netflix', category: 'entertainment', type: 'streaming' },
  { name: 'Amazon Prime', category: 'entertainment', type: 'streaming' },
  { name: 'Uber', category: 'transport', type: 'rideshare' },
  { name: 'Cabify', category: 'transport', type: 'rideshare' },
  { name: 'Smart Fit', category: 'health', type: 'gym' },
  { name: 'Macrosalud', category: 'health', type: 'healthcare' },
  { name: 'ASSE', category: 'health', type: 'healthcare' },
  { name: 'OCA', category: 'transport', type: 'courier' },
  { name: 'DHL', category: 'transport', type: 'courier' },
  { name: 'Starbucks', category: 'food', type: 'cafe' },
  { name: 'Mosca', category: 'food', type: 'cafe' },
  { name: 'Las Acacias', category: 'food', type: 'restaurant' },
  { name: 'Panini\'s', category: 'food', type: 'restaurant' },
  { name: 'Francis', category: 'food', type: 'restaurant' },
];

export const categories: Category[] = [
  { id: 'food', name: 'Alimentación', icon: 'UtensilsCrossed', color: 'var(--category-food)', type: 'expense' },
  { id: 'transport', name: 'Transporte', icon: 'Car', color: 'var(--category-transport)', type: 'expense' },
  { id: 'utilities', name: 'Servicios', icon: 'Zap', color: 'var(--category-utilities)', type: 'expense' },
  { id: 'entertainment', name: 'Entretenimiento', icon: 'Tv', color: 'var(--category-entertainment)', type: 'expense' },
  { id: 'shopping', name: 'Compras', icon: 'ShoppingBag', color: 'var(--category-shopping)', type: 'expense' },
  { id: 'health', name: 'Salud', icon: 'Heart', color: 'var(--category-health)', type: 'expense' },
  { id: 'education', name: 'Educación', icon: 'GraduationCap', color: 'var(--category-education)', type: 'expense' },
  { id: 'income', name: 'Ingresos', icon: 'TrendingUp', color: 'var(--category-income)', type: 'income' },
  { id: 'other', name: 'Otros', icon: 'MoreHorizontal', color: 'var(--category-other)', type: 'expense' },
];

// Generate sample transactions
export function generateSampleTransactions(count: number = 100): Transaction[] {
  const transactions: Transaction[] = [];
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-12-29');
  
  for (let i = 0; i < count; i++) {
    const merchant = uruguayanMerchants[Math.floor(Math.random() * uruguayanMerchants.length)];
    const category = merchant.category;
    const isIncome = Math.random() < 0.1; // 10% income
    const finalCategory = isIncome ? 'income' : category;
    
    // Random date between start and end
    const date = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
    
    // Random amount based on category
    let amount = 0;
    if (isIncome) {
      amount = Math.random() * 50000 + 30000; // 30k-80k UYU salary
    } else {
      switch (category) {
        case 'food':
          amount = Math.random() * 5000 + 500;
          break;
        case 'transport':
          amount = Math.random() * 3000 + 200;
          break;
        case 'utilities':
          amount = Math.random() * 4000 + 1000;
          break;
        case 'entertainment':
          amount = Math.random() * 2000 + 300;
          break;
        case 'shopping':
          amount = Math.random() * 8000 + 1000;
          break;
        case 'health':
          amount = Math.random() * 6000 + 500;
          break;
        default:
          amount = Math.random() * 3000 + 500;
      }
    }
    
    // Randomly assign currency and account
    const currency: Currency = Math.random() < 0.8 ? 'UYU' : 'USD';
    const accountTypes: AccountType[] = ['credit_card', 'usd_account', 'uyu_account'];
    const accountType = accountTypes[Math.floor(Math.random() * accountTypes.length)];
    
    // Convert to USD if USD currency
    if (currency === 'USD') {
      amount = amount / 40; // Approximate exchange rate
    }
    
    // Auto-categorization confidence
    const confidence = Math.random() * 0.4 + 0.6; // 0.6-1.0
    const manualOverride = Math.random() < 0.15; // 15% manual overrides
    
    transactions.push({
      id: `txn-${i + 1}`,
      date,
      description: `${merchant.name} - ${merchant.type}`,
      merchant: merchant.name,
      amount: isIncome ? amount : -amount,
      currency,
      category: finalCategory,
      accountType,
      autoCategory: finalCategory,
      confidence: manualOverride ? 1 : confidence,
      manualOverride,
    });
  }
  
  // Sort by date descending
  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Format currency
export function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);
  
  const symbol = currency === 'UYU' ? '$U' : 'US$';
  return `${symbol} ${formatted}`;
}

// Format date for Uruguay
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

// Format date with time
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// Calculate summary stats
export function calculateSummary(transactions: Transaction[], currency?: Currency) {
  const filtered = currency 
    ? transactions.filter(t => t.currency === currency)
    : transactions;
    
  const income = filtered
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
    
  const expenses = filtered
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
  return {
    income,
    expenses,
    balance: income - expenses,
    transactionCount: filtered.length,
  };
}

// Group transactions by category
export function groupByCategory(transactions: Transaction[]) {
  const grouped: Record<string, number> = {};
  
  transactions
    .filter(t => t.amount < 0) // Only expenses
    .forEach(t => {
      grouped[t.category] = (grouped[t.category] || 0) + Math.abs(t.amount);
    });
    
  return grouped;
}

// Group transactions by month
export function groupByMonth(transactions: Transaction[]) {
  const grouped: Record<string, { income: number; expenses: number }> = {};
  
  transactions.forEach(t => {
    const month = new Intl.DateTimeFormat('es-UY', { 
      year: 'numeric', 
      month: 'short' 
    }).format(t.date);
    
    if (!grouped[month]) {
      grouped[month] = { income: 0, expenses: 0 };
    }
    
    if (t.amount > 0) {
      grouped[month].income += t.amount;
    } else {
      grouped[month].expenses += Math.abs(t.amount);
    }
  });
  
  return grouped;
}
