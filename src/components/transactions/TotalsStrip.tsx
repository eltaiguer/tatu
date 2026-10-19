import { useMemo } from 'react'
import { Slash, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { Currency, Transaction } from '../../models'
import { fitMonoFontSize, formatCurrency } from '../../utils/formatting'
import { sumCountedTotals } from '../../services/spending/spending-rules'

/* ---- TotalsStrip ---- */
function TotalTile({
  label,
  value,
  fitTo,
  sub,
  accent,
  icon,
}: {
  label: string
  value: string
  // Size the amount as if it were this string, so a row of tiles shares one
  // font size (that of its longest value).
  fitTo: string
  sub?: string
  accent?: string
  icon: React.ReactNode
}) {
  return (
    <div className="@container flex min-w-0 flex-col gap-[3px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-[16px] py-[14px]">
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
      {sub && <div className="text-[12px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  )
}

export function TotalsStrip({
  rows,
  homeCurrency,
  fxRate,
  ignoredCount,
}: {
  rows: Transaction[]
  homeCurrency: string
  fxRate: number
  ignoredCount: number
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
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        sub="Ingresos − gastos"
      />
      <TotalTile
        label="Transferencias"
        icon={<Slash size={14} />}
        value={String(ignoredCount)}
        fitTo={fitTo}
        sub={
          ignoredCount ? 'Ignoradas · no se cuentan' : 'Ninguna en el período'
        }
      />
    </div>
  )
}
