import { useMemo } from 'react'
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { Currency, Transaction } from '../../models'
import { fitMonoFontSize, formatCurrency } from '../../utils/formatting'
import { sumCountedTotals } from '../../services/spending/spending-rules'

/* ---- TotalsStrip ---- */
function TotalTile({
  label,
  value,
  fitTo,
  accent,
  icon,
}: {
  label: string
  value: string
  // Size the amount as if it were this string, so a row of tiles shares one
  // font size (that of its longest value).
  fitTo: string
  accent?: string
  icon: React.ReactNode
}) {
  return (
    // Phones: label left, amount right, one row each (three columns would
    // shrink long peso totals to ~9px). From sm: three columns.
    <div className="@container flex min-w-0 items-baseline justify-between gap-3 py-2 sm:flex-col sm:items-stretch sm:justify-start sm:gap-[3px] sm:px-4 sm:py-1 sm:first:pl-0 sm:last:pr-0">
      <div className="flex min-w-0 items-center gap-[6px]">
        <span className="grid shrink-0 text-[var(--text-muted)]">{icon}</span>
        <span className="overflow-hidden text-[11px] font-semibold tracking-[0.05em] text-ellipsis whitespace-nowrap text-[var(--text-muted)] uppercase">
          {label}
        </span>
      </div>
      <div
        className="font-mono font-semibold tracking-[-0.02em] whitespace-nowrap"
        style={{
          // Data-driven: sized to the row's longest value; color per tile.
          fontSize: fitMonoFontSize(fitTo, 22),
          color: accent ?? 'var(--text)',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// The period's money in three figures, on the page rather than in tiles. The
// ignored-transfer count lives on the table's toggle, next to what it hides.
export function TotalsStrip({
  rows,
  homeCurrency,
  fxRate,
}: {
  rows: Transaction[]
  homeCurrency: string
  fxRate: number
}) {
  const totals = useMemo(
    () => sumCountedTotals(rows, homeCurrency as Currency, fxRate),
    [rows, homeCurrency, fxRate]
  )

  const cur = homeCurrency as Currency
  const net = totals.net
  const incomeText = formatCurrency(totals.income, cur)
  const expenseText = formatCurrency(totals.expense, cur)
  const netText = `${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net), cur)}`
  const fitTo = [incomeText, expenseText, netText].reduce((a, b) =>
    b.length > a.length ? b : a
  )

  return (
    <div
      role="group"
      aria-label="Totales del período"
      className="mb-4 grid grid-cols-1 divide-y divide-[var(--border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    >
      <TotalTile
        label="Ingresos"
        icon={<TrendingUp size={14} />}
        value={incomeText}
        fitTo={fitTo}
        accent="var(--pos)"
      />
      <TotalTile
        label="Gastos"
        icon={<TrendingDown size={14} />}
        value={expenseText}
        fitTo={fitTo}
      />
      <TotalTile
        label="Balance"
        icon={<Wallet size={14} />}
        value={netText}
        fitTo={fitTo}
        accent={net >= 0 ? 'var(--pos)' : 'var(--neg)'}
      />
    </div>
  )
}
