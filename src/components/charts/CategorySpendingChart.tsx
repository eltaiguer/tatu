import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { Currency, Transaction } from '../../models'
import { buildCategorySpending } from '../../services/charts/chart-data'
import { getCategoryDefinition } from '../../services/categories/category-registry'

interface CategorySpendingChartProps {
  transactions: Transaction[]
  currency: Currency
}

export function CategorySpendingChart({
  transactions,
  currency,
}: CategorySpendingChartProps) {
  const data = buildCategorySpending(transactions, currency).map((item) => {
    const definition = getCategoryDefinition(item.category)
    return {
      ...item,
      label: definition.label,
      color: definition.color,
    }
  })

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
              <Cell key={`${entry.category}-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => `${value.toFixed(2)} ${currency}`}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
