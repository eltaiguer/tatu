import type { Currency } from '../models'
import { formatCurrency } from '../utils/formatting'

export interface CategoryBreakdownRow {
  id: string
  label: string
  color: string
  emoji?: string
  amount: number
  pct: number
}

interface CategoryBreakdownListProps {
  rows: CategoryBreakdownRow[]
  currency: Currency
  showPercent?: boolean
  onClickRow?: (id: string) => void
}

export function CategoryBreakdownList({
  rows,
  currency,
  showPercent = false,
  onClickRow,
}: CategoryBreakdownListProps) {
  return (
    <div className="flex flex-col gap-[14px]">
      {rows.map((row) => {
        const content = (
          <>
            <div className="mb-[5px] flex items-baseline justify-between">
              <span className="inline-flex items-center gap-[8px] text-[14px] font-medium">
                {row.emoji ? (
                  <span className="text-[14px]">{row.emoji}</span>
                ) : (
                  <span
                    className="inline-block h-[9px] w-[9px] shrink-0 rounded-[3px]"
                    style={{ background: row.color }}
                  />
                )}
                {row.label}
              </span>
              <span className="inline-flex items-baseline gap-[10px]">
                <span className="font-mono text-[13px]">
                  {formatCurrency(row.amount, currency)}
                </span>
                {showPercent && (
                  <span className="font-mono text-muted-foreground w-[38px] text-right text-[12px]">
                    {row.pct.toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
            <div className="h-[4px] overflow-hidden rounded-[2px] bg-[var(--surface-2)]">
              <div
                className="h-full rounded-[2px]"
                style={{ width: `${row.pct}%`, background: row.color }}
              />
            </div>
          </>
        )
        // A real button when rows open their transactions (keyboard and
        // screen readers), a plain block otherwise.
        return onClickRow ? (
          <button
            key={row.id}
            type="button"
            onClick={() => onClickRow(row.id)}
            aria-label={`Ver los gastos en ${row.label}`}
            className="block w-full rounded-md text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content}
          </button>
        ) : (
          <div key={row.id}>{content}</div>
        )
      })}
    </div>
  )
}
