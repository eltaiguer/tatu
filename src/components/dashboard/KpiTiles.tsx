// Resumen KPI tiles — 4-col: top category, monthly average, savings rate,
// uncategorized spend.

import type { Currency, TransactionsFilter } from '../../models'
import { Category } from '../../models'
import type { CategorySpendingDatum } from '../../services/charts/chart-data'
import type {
  CategorySpendRow,
  MonthlyTrendRow,
} from '../../services/charts/dashboard-rows'
import { formatCurrency, fitMonoFontSize } from '../../utils/formatting'
import { Card } from '../ui/card'
import { DrillTarget } from './DrillTarget'

interface KpiTilesProps {
  topCategory: CategorySpendRow | undefined
  monthlyTrend: MonthlyTrendRow[]
  uncategorizedSpend: CategorySpendingDatum | undefined
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function KpiTiles({
  topCategory,
  monthlyTrend,
  uncategorizedSpend,
  homeCurrency,
  onNavigateToTransactions,
}: KpiTilesProps) {
  const totalIncome = monthlyTrend.reduce((s, m) => s + m.ingresos, 0)
  const totalExpenseTrend = monthlyTrend.reduce((s, m) => s + m.gastos, 0)
  const savingsRate =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpenseTrend) / totalIncome) * 100)
      : 0
  const avgMonthly =
    monthlyTrend.length > 0
      ? Math.round(totalExpenseTrend / monthlyTrend.length)
      : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="overflow-hidden p-0">
        <DrillTarget
          onOpen={
            onNavigateToTransactions && topCategory
              ? () =>
                  onNavigateToTransactions({
                    categories: [topCategory.categoryId],
                    type: 'debit',
                  })
              : undefined
          }
          label={`Ver la mayor categoría: ${topCategory?.label ?? ''}`}
          className="h-full p-5"
        >
          <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
            Mayor categoría
          </div>
          <div className="mb-[4px] text-[20px] font-bold">
            {topCategory?.label ?? '—'}
          </div>
          <div className="text-[12px] text-muted-foreground">
            {topCategory
              ? `${Math.round(topCategory.pct)}% del gasto · todo el historial`
              : 'Sin datos'}
          </div>
        </DrillTarget>
      </Card>
      <Card className="@container p-5">
        <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
          Gasto promedio mensual
        </div>
        <div
          className="font-mono mb-[4px] font-bold whitespace-nowrap"
          style={{
            fontSize: fitMonoFontSize(
              formatCurrency(avgMonthly, homeCurrency),
              20
            ),
          }}
        >
          {formatCurrency(avgMonthly, homeCurrency)}
        </div>
        <div className="text-[12px] text-muted-foreground">
          Últimos {monthlyTrend.length} meses
        </div>
      </Card>
      <Card className="p-5">
        <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
          Tasa de ahorro
        </div>
        <div
          className="mb-[4px] text-[20px] font-bold"
          style={{
            color: savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)',
          }}
        >
          {savingsRate}%
        </div>
        <div className="text-[12px] text-muted-foreground">
          Ingresos no gastados · últimos {monthlyTrend.length} meses
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <DrillTarget
          onOpen={
            onNavigateToTransactions && uncategorizedSpend
              ? () =>
                  onNavigateToTransactions({
                    categories: [Category.Uncategorized],
                    type: 'debit',
                  })
              : undefined
          }
          label="Ver los gastos sin categoría"
          className="h-full p-5"
        >
          <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
            Sin categoría
          </div>
          <div className="font-mono mb-[4px] text-[20px] font-bold">
            {formatCurrency(uncategorizedSpend?.total ?? 0, homeCurrency)}
          </div>
          <div className="text-[12px] text-muted-foreground">
            {uncategorizedSpend
              ? `${uncategorizedSpend.count} ${uncategorizedSpend.count === 1 ? 'gasto' : 'gastos'} · todo el historial`
              : 'Todo categorizado'}
          </div>
        </DrillTarget>
      </Card>
    </div>
  )
}
