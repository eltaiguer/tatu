// Gasto por categoría — donut + ranked rows (all-history).

import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import type { TooltipProps } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'
import type { Currency, TransactionsFilter } from '../../models'
import {
  OTHER_ROW_ID,
  type CategorySpendRow,
} from '../../services/charts/dashboard-rows'
import { formatCurrency } from '../../utils/formatting'
import { Card } from '../ui/card'
import { CategoryBreakdownList } from '../CategoryBreakdownList'
import type { CategoryBreakdownRow } from '../CategoryBreakdownList'

interface CategorySpendCardProps {
  donutData: CategorySpendRow[]
  // Category ids folded into the "Otros" slice.
  otherCategoryIds: string[]
  totalExpenses: number
  periodRange: string | null
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function CategorySpendCard({
  donutData,
  otherCategoryIds,
  totalExpenses,
  periodRange,
  homeCurrency,
  onNavigateToTransactions,
}: CategorySpendCardProps) {
  const hasExpenseData = totalExpenses > 0

  // The list mirrors the donut, including its "Otros" slice, so every slice
  // has a keyboard-reachable equivalent that opens exactly its rows.
  const openCategoryRow = onNavigateToTransactions
    ? (id: string) =>
        onNavigateToTransactions({
          categories: id === OTHER_ROW_ID ? otherCategoryIds : [id],
          type: 'debit',
        })
    : undefined
  const breakdownRows = useMemo<CategoryBreakdownRow[]>(
    () =>
      donutData.map((row) => ({
        id: row.categoryId,
        label: row.label,
        color: row.color,
        emoji: row.emoji,
        amount: row.value,
        pct: row.pct,
      })),
    [donutData]
  )

  const customTooltip = ({
    active,
    payload,
  }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
      const value = Number(payload[0].value ?? 0)
      const label =
        (payload[0].payload as { label?: string } | undefined)?.label ??
        String(payload[0].name ?? '')
      return (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[14px] py-[10px] shadow-[var(--shadow-md)]">
          <p className="mb-[2px] text-[13px] font-semibold">{label}</p>
          <p className="font-mono text-[13px] text-[var(--text-faint)]">
            {formatCurrency(value, homeCurrency)}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <Card className="p-6">
      <div className="mb-[20px] flex items-baseline justify-between">
        <div>
          <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
            Gasto por categoría
          </h2>
          {periodRange && (
            <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
              {periodRange}
            </p>
          )}
        </div>
        {onNavigateToTransactions && (
          <button
            onClick={() => onNavigateToTransactions({ type: 'debit' })}
            className="flex cursor-pointer items-center gap-[4px] border-none bg-transparent text-[13px] font-medium text-[var(--brand)]"
          >
            Ver movimientos <ArrowRight size={14} />
          </button>
        )}
      </div>
      {!hasExpenseData ? (
        <p className="text-[13px] text-muted-foreground">
          Sin gastos registrados.
        </p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[240px_1fr] sm:gap-9">
          <div className="relative mx-auto h-[220px] w-[220px] sm:mx-0">
            <PieChart width={220} height={220}>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={100}
                dataKey="value"
                startAngle={90}
                endAngle={450}
              >
                {donutData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                    cursor={openCategoryRow ? 'pointer' : undefined}
                    onClick={() => openCategoryRow?.(entry.categoryId)}
                  />
                ))}
              </Pie>
              <Tooltip content={customTooltip} />
            </PieChart>
            <div className="pointer-events-none absolute top-[50%] left-[50%] [transform:translate(-50%,-50%)] text-center">
              <div className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
                TOTAL
              </div>
              <div className="font-mono text-[15px] font-bold">
                {formatCurrency(totalExpenses, homeCurrency)}
              </div>
            </div>
          </div>

          <CategoryBreakdownList
            rows={breakdownRows}
            currency={homeCurrency}
            showPercent
            onClickRow={openCategoryRow}
          />
        </div>
      )}
    </Card>
  )
}
