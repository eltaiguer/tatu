import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { Currency, Transaction } from '../../models'
import { Category, CATEGORY_LABELS } from '../../models'
import { buildCategorySpending } from '../../services/charts/chart-data'

const COLORS = ['#111827', '#2563eb', '#16a34a', '#f97316', '#ef4444']

interface CategorySpendingChartProps {
  transactions: Transaction[]
  currency: Currency
}

export function CategorySpendingChart({
  transactions,
  currency,
}: CategorySpendingChartProps) {
  const data = buildCategorySpending(transactions, currency).map((item) => ({
    ...item,
    label: CATEGORY_LABELS[item.category as Category] ?? item.category,
  }))

  return (
    <div className="h-64 w-full" data-testid="chart-category">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="label"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`${entry.category}-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) =>
              `${value.toFixed(2)} ${currency}`
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
