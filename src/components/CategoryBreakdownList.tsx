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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map((row) => (
        <div
          key={row.id}
          onClick={() => onClickRow?.(row.id)}
          style={{ cursor: onClickRow ? 'pointer' : 'default' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 5,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13.5,
                fontWeight: 500,
              }}
            >
              {row.emoji ? (
                <span style={{ fontSize: 14 }}>{row.emoji}</span>
              ) : (
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: row.color,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
              )}
              {row.label}
            </span>
            <span
              style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}
            >
              <span className="font-mono" style={{ fontSize: 13 }}>
                {formatCurrency(row.amount, currency)}
              </span>
              {showPercent && (
                <span
                  className="font-mono text-muted-foreground"
                  style={{ fontSize: 11.5, width: 38, textAlign: 'right' }}
                >
                  {row.pct.toFixed(1)}%
                </span>
              )}
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: 'var(--surface-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${row.pct}%`,
                background: row.color,
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
