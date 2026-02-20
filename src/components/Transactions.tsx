// Transactions List - Main transaction view with sorting and pagination

import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { CategoryBadge } from './CategoryBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Search, ArrowUpDown, Pencil, CreditCard, Wallet } from 'lucide-react';
import type { Transaction, Currency } from '../models';
import { useState, useMemo } from 'react';
import { Category } from '../models';
import { useEffect } from 'react';

// Helper functions
function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);

  const symbol = currency === 'UYU' ? '$U' : 'US$';
  return `${symbol} ${formatted}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

interface TransactionsProps {
  transactions: Transaction[];
}

type SortField = 'date' | 'amount' | 'description' | 'category';
type SortDirection = 'asc' | 'desc';

export function Transactions({ transactions }: TransactionsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Filter and sort transactions
  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(t =>
      t.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort
    filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;

      if (sortField === 'date') {
        return (a.date.getTime() - b.date.getTime()) * direction;
      }

      if (sortField === 'amount') {
        return (Math.abs(a.amount) - Math.abs(b.amount)) * direction;
      }

      if (sortField === 'description') {
        return a.description.localeCompare(b.description, 'es') * direction;
      }

      const aCategory = a.category ?? '';
      const bCategory = b.category ?? '';
      return aCategory.localeCompare(bCategory, 'es') * direction;
    });

    return filtered;
  }, [transactions, searchTerm, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const safeTotalPages = Math.max(1, totalPages);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, safeTotalPages));
  }, [safeTotalPages]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getAccountIcon = (type: string) => {
    if (type === 'credit_card') return <CreditCard size={14} />;
    return <Wallet size={14} />;
  };

  const getAccountLabel = (type: string) => {
    if (type === 'credit_card') return 'Tarjeta';
    return 'Cuenta';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="mb-1">Transacciones</h2>
          <p className="text-muted-foreground">
            {filteredTransactions.length} transacciones encontradas
          </p>
        </div>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <Input
            placeholder="Buscar por comercio o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Transactions Table */}
      <Card className="overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-4 text-sm font-medium">
                  <button 
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Fecha
                    {sortField === 'date' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('description')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Descripción
                    {sortField === 'description' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button 
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Categoría
                    {sortField === 'category' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">Confianza</th>
                <th className="text-left p-4 text-sm font-medium">Cuenta</th>
                <th className="text-right p-4 text-sm font-medium">
                  <button 
                    onClick={() => handleSort('amount')}
                    className="flex items-center gap-2 ml-auto hover:text-primary transition-colors"
                  >
                    Monto
                    {sortField === 'amount' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-center p-4 text-sm font-medium w-20">Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {searchTerm
                      ? 'No hay transacciones que coincidan con la búsqueda'
                      : 'No hay transacciones para mostrar'}
                  </td>
                </tr>
              )}
              {paginatedTransactions.map((transaction) => (
                <tr 
                  key={transaction.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="p-4">
                    <div className="text-sm">{formatDate(transaction.date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.date.toLocaleTimeString('es-UY', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{transaction.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.type === 'debit' ? 'Débito' : 'Crédito'}
                    </div>
                  </td>
                  <td className="p-4">
                    <CategoryBadge
                      categoryId={transaction.category || Category.Uncategorized}
                      size="sm"
                    />
                  </td>
                  <td className="p-4">
                    <ConfidenceBadge
                      confidence={transaction.categoryConfidence || 0}
                      manualOverride={false}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {getAccountIcon(transaction.source)}
                      <span>{getAccountLabel(transaction.source)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div
                      className={`font-mono ${
                        transaction.type === 'credit'
                          ? 'text-success-600'
                          : 'text-foreground'
                      }`}
                    >
                      {transaction.type === 'credit' ? '+' : '-'}
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <Button variant="ghost" size="sm">
                      <Pencil size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-border">
          {paginatedTransactions.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {searchTerm
                ? 'No hay transacciones que coincidan con la búsqueda'
                : 'No hay transacciones para mostrar'}
            </div>
          )}
          {paginatedTransactions.map((transaction) => (
            <div key={transaction.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium mb-1">{transaction.description}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {formatDate(transaction.date)}
                  </div>
                </div>
                <div
                  className={`font-mono ${
                    transaction.type === 'credit'
                      ? 'text-success-600'
                      : 'text-foreground'
                  }`}
                >
                  {transaction.type === 'credit' ? '+' : '-'}
                  {formatCurrency(transaction.amount, transaction.currency)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge
                  categoryId={transaction.category || Category.Uncategorized}
                  size="sm"
                />
                <ConfidenceBadge
                  confidence={transaction.categoryConfidence || 0}
                  manualOverride={false}
                />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {getAccountIcon(transaction.source)}
                  {getAccountLabel(transaction.source)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length === 0
            ? 'Mostrando 0 de 0'
            : `Mostrando ${startIndex + 1}-${Math.min(startIndex + itemsPerPage, filteredTransactions.length)} de ${filteredTransactions.length}`}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1;
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-10"
                >
                  {page}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === safeTotalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}
