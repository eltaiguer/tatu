import { useMemo } from 'react'
import { House, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { Currency, HouseholdFilter, Transaction } from '../../models'
import { fitMonoFontSize, formatCurrency } from '../../utils/formatting'
import { sumCountedTotals } from '../../services/spending/spending-rules'

/* ---- TotalsStrip ---- */
function TotalTile({
  label,
  value,
  fitTo,
  accent,
  icon,
  note,
  phoneFit,
  className = '',
}: {
  label: string
  value: string
  // Size the amount as if it were this string, so a row of tiles shares one
  // font size (that of its longest value).
  fitTo: string
  accent?: string
  icon: React.ReactNode
  // A short line under the amount (the one-tile Hogar strip).
  note?: React.ReactNode
  // Phones only: size the amount as if it were this string, at that size.
  phoneFit?: { text: string; size: number }
  // Phone layout of the tile in the strip's grid (borders, span, order).
  className?: string
}) {
  return (
    // Phones: Gastos on a line of its own (label left, amount right), then
    // Ingresos | Balance side by side, label above amount (three columns
    // would shrink long peso totals to ~11px). From sm: three columns.
    <div
      className={`@container min-w-0 py-1.5 sm:py-1 ${className} flex items-baseline justify-between gap-3 sm:flex-col sm:items-stretch sm:justify-start sm:gap-[3px] sm:px-4 sm:first:pl-0 sm:last:pr-0${
        // The Hogar tile's note drops to its own row on phones; the plain
        // tiles keep label and amount on one row (the label ellipsizes).
        note ? ' flex-wrap sm:flex-nowrap' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-[6px]">
        <span className="grid shrink-0 text-[var(--text-muted)]">{icon}</span>
        <span className="overflow-hidden text-[11px] font-semibold tracking-[0.05em] text-ellipsis whitespace-nowrap text-[var(--text-muted)] uppercase">
          {label}
        </span>
      </div>
      <div
        className="font-mono font-semibold tracking-[-0.02em] whitespace-nowrap text-[length:var(--amt-sm)] sm:text-[length:var(--amt-lg)]"
        style={
          {
            // Data-driven: sized to the row's longest value; color per tile.
            '--amt-sm': fitMonoFontSize(
              phoneFit?.text ?? fitTo,
              phoneFit?.size ?? 22
            ),
            '--amt-lg': fitMonoFontSize(fitTo, 22),
            color: accent ?? 'var(--text)',
          } as React.CSSProperties
        }
      >
        {value}
      </div>
      {note && (
        <div className="basis-full text-[12px] text-[var(--text-muted)] sm:basis-auto">
          {note}
        </div>
      )}
    </div>
  )
}

// The period's money in three figures, on the page rather than in tiles. The
// ignored-row count lives in the Filtros panel's toggle and the table
// toolbar's hint.
export function TotalsStrip({
  rows,
  homeCurrency,
  fxRate,
  household = 'all',
}: {
  rows: Transaction[]
  homeCurrency: string
  fxRate: number
  // Under the Hogar filter the strip is one total: the rows are counted
  // expenses already, so there is no income or balance to show.
  household?: HouseholdFilter
}) {
  const totals = useMemo(
    () => sumCountedTotals(rows, homeCurrency as Currency, fxRate),
    [rows, homeCurrency, fxRate]
  )

  const cur = homeCurrency as Currency
  if (household !== 'all') {
    // Under the Hogar filter every row is a counted expense.
    const count = rows.length
    const value = formatCurrency(totals.expense, cur)
    return (
      <div
        role="group"
        aria-label="Totales del período"
        className="mb-4 grid grid-cols-1 divide-y divide-[var(--border)]"
      >
        <TotalTile
          label="Gastos del hogar"
          icon={<House size={14} />}
          value={value}
          fitTo={value}
          note={[
            <div key="count">{`${count} ${count === 1 ? 'gasto' : 'gastos'}`}</div>,
          ]}
        />
      </div>
    )
  }
  const net = totals.net
  const incomeText = formatCurrency(totals.income, cur)
  const expenseText = formatCurrency(totals.expense, cur)
  const netText = `${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net), cur)}`
  const fitTo = [incomeText, expenseText, netText].reduce((a, b) =>
    b.length > a.length ? b : a
  )

  // Phones read Gastos first, then Ingresos | Balance, while the DOM keeps
  // Ingresos, Gastos, Balance (the desktop order): `order-first` + `col-span-2`.
  const sideFit = {
    text: incomeText.length > netText.length ? incomeText : netText,
    size: 16,
  }
  const sideTile =
    'max-sm:flex-col max-sm:items-stretch max-sm:justify-start max-sm:gap-[3px]'

  return (
    <div
      role="group"
      aria-label="Totales del período"
      className="mb-4 grid grid-cols-2 sm:grid-cols-3 sm:divide-x sm:divide-[var(--border)]"
    >
      <TotalTile
        label="Ingresos"
        icon={<TrendingUp size={14} />}
        value={incomeText}
        fitTo={fitTo}
        phoneFit={sideFit}
        className={`${sideTile} max-sm:border-r max-sm:border-[var(--border)] max-sm:pr-3`}
        accent="var(--pos)"
      />
      <TotalTile
        label="Gastos"
        icon={<TrendingDown size={14} />}
        value={expenseText}
        fitTo={fitTo}
        className="order-first col-span-2 border-b border-[var(--border)] sm:order-none sm:col-span-1 sm:border-b-0"
      />
      <TotalTile
        label="Balance"
        icon={<Wallet size={14} />}
        value={netText}
        fitTo={fitTo}
        phoneFit={sideFit}
        className={`${sideTile} max-sm:pl-3`}
        accent={net >= 0 ? 'var(--pos)' : 'var(--neg)'}
      />
    </div>
  )
}
