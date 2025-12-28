import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Currency, Transaction } from '../../models'
import { buildIncomeExpenseSummary } from '../../services/charts/chart-data'

interface IncomeExpenseChartProps {
  transactions: Transaction[]
  currency: Currency
}

export function IncomeExpenseChart({
  transactions,
  currency,
}: IncomeExpenseChartProps) {
  const summary = buildIncomeExpenseSummary(transactions, currency)
  const data = [
    {
      name: 'Income',
      value: summary.income,
    },
    {
      name: 'Expenses',
      value: summary.expense,
    },
  ]

  return (
    <div className="h-64 w-full" data-testid="chart-income-expense">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={80} />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(2)} ${currency}`}
          />
          <Bar dataKey="value" fill="#2563eb" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
