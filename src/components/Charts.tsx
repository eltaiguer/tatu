// Charts - Data visualization and insights

import { Card } from './ui/card';
import type { Transaction } from '../models';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCategoryDisplay } from '../utils/category-display';
import { Category } from '../models';

// Helper functions
function groupByCategory(transactions: Transaction[]) {
  const grouped: Record<string, number> = {};

  transactions
    .filter(t => t.type === 'debit') // Only expenses
    .forEach(t => {
      const category = t.category || Category.Uncategorized;
      grouped[category] = (grouped[category] || 0) + t.amount;
    });

  return grouped;
}

function groupByMonth(transactions: Transaction[]) {
  const grouped: Record<string, { income: number; expenses: number }> = {};

  transactions.forEach(t => {
    const month = new Intl.DateTimeFormat('es-UY', {
      year: 'numeric',
      month: 'short'
    }).format(t.date);

    if (!grouped[month]) {
      grouped[month] = { income: 0, expenses: 0 };
    }

    if (t.type === 'credit') {
      grouped[month].income += t.amount;
    } else {
      grouped[month].expenses += t.amount;
    }
  });

  return grouped;
}

interface ChartsProps {
  transactions: Transaction[];
}

export function Charts({ transactions }: ChartsProps) {
  // Prepare data for charts
  const categoryData = Object.entries(groupByCategory(transactions))
    .map(([categoryId, amount]) => {
      const category = getCategoryDisplay(categoryId);
      return {
        name: category.label,
        value: amount,
        color: category.color,
      };
    })
    .sort((a, b) => b.value - a.value);

  const monthData = Object.entries(groupByMonth(transactions))
    .map(([month, data]) => ({
      month,
      ingresos: data.income,
      gastos: data.expenses,
    }))
    .slice(-6); // Last 6 months

  // Calculate totals
  const totalExpenses = categoryData.reduce((sum, cat) => sum + cat.value, 0);

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium mb-1">{payload[0].name}</p>
          <p className="text-sm text-muted-foreground">
            $U {payload[0].value.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {totalExpenses > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {((payload[0].value / totalExpenses) * 100).toFixed(1)}% del total
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="mb-1">Insights y Análisis</h2>
        <p className="text-muted-foreground">Visualización de tus patrones de gasto</p>
      </div>

      {/* Category Distribution */}
      <Card className="p-6">
        <h3 className="mb-6">Gastos por Categoría</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) =>
                    `${entry.name} ${totalExpenses > 0 ? ((entry.value / totalExpenses) * 100).toFixed(0) : 0}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={customTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            <h4 className="mb-4">Desglose Detallado</h4>
            {categoryData.map((cat, index) => {
              const percentage = (cat.value / totalExpenses) * 100;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.name}</span>
                    </div>
                    <span className="font-mono">
                      $U {cat.value.toLocaleString('es-UY', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${percentage}%`,
                        backgroundColor: cat.color
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {percentage.toFixed(1)}% del total
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Monthly Trends */}
      <Card className="p-6">
        <h3 className="mb-6">Tendencia Mensual</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={monthData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis 
              dataKey="month" 
              stroke="var(--muted-foreground)"
              style={{ fontSize: '0.875rem' }}
            />
            <YAxis 
              stroke="var(--muted-foreground)"
              style={{ fontSize: '0.875rem' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                boxShadow: 'var(--shadow-lg)'
              }}
              formatter={(value: any) => `$U ${value.toLocaleString('es-UY', { minimumFractionDigits: 2 })}`}
            />
            <Legend />
            <Bar dataKey="ingresos" fill="var(--chart-3)" name="Ingresos" radius={[8, 8, 0, 0]} />
            <Bar dataKey="gastos" fill="var(--chart-2)" name="Gastos" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Income vs Expenses Comparison */}
      <Card className="p-6">
        <h3 className="mb-6">Comparación Ingresos vs Gastos</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={monthData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis 
              dataKey="month" 
              stroke="var(--muted-foreground)"
              style={{ fontSize: '0.875rem' }}
            />
            <YAxis 
              stroke="var(--muted-foreground)"
              style={{ fontSize: '0.875rem' }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                boxShadow: 'var(--shadow-lg)'
              }}
              formatter={(value: any) => `$U ${value.toLocaleString('es-UY', { minimumFractionDigits: 2 })}`}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="ingresos" 
              stroke="var(--chart-3)" 
              strokeWidth={3}
              name="Ingresos"
              dot={{ r: 6 }}
              activeDot={{ r: 8 }}
            />
            <Line 
              type="monotone" 
              dataKey="gastos" 
              stroke="var(--chart-2)" 
              strokeWidth={3}
              name="Gastos"
              dot={{ r: 6 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Mayor Categoría</p>
            <p className="text-2xl font-mono">{categoryData[0]?.name || 'Sin datos'}</p>
            <p className="text-sm text-muted-foreground">
              {totalExpenses > 0 && categoryData[0]
                ? `${((categoryData[0].value / totalExpenses) * 100).toFixed(1)}% del total`
                : '0.0% del total'}
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Gasto Promedio Mensual</p>
            <p className="text-2xl font-mono">
              $U {(totalExpenses / 6).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-sm text-muted-foreground">
              Últimos 6 meses
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Categorías Activas</p>
            <p className="text-2xl font-mono">{categoryData.length}</p>
            <p className="text-sm text-muted-foreground">
              Con transacciones registradas
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
