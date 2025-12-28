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
import { buildMonthlyTrends } from '../../services/charts/chart-data'

interface MonthlyTrendsChartProps {
  transactions: Transaction[]
  currency: Currency
}

export function MonthlyTrendsChart({
  transactions,
  currency,
}: MonthlyTrendsChartProps) {
  const data = buildMonthlyTrends(transactions, currency)

  return (
    <div className="h-64 w-full" data-testid="chart-trends">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(2)} ${currency}`}
          />
          <Bar dataKey="income" fill="#16a34a" radius={[6, 6, 0, 0]} />
          <Bar dataKey="expense" fill="#ef4444" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
