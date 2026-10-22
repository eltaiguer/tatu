// Gasto por moneda — single split bar + legend.

import type { Currency } from '../../models'
import type { CurrencySplitData } from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'

function SplitBar({ pctUSD, pctUYU }: { pctUSD: number; pctUYU: number }) {
  return (
    <div className="flex h-[10px] overflow-hidden rounded-[5px] bg-[var(--surface-2)]">
      <div
        className="bg-[var(--brand)] [transition:width_0.3s]"
        style={{ width: `${pctUSD}%` }}
      />
      <div
        className="bg-[var(--accent)] [transition:width_0.3s]"
        style={{ width: `${pctUYU}%` }}
      />
    </div>
  )
}

interface CurrencySplitCardProps {
  currencySplit: CurrencySplitData
  homeCurrency: Currency
}

// Un-boxed: a strip under the account cards, since the cards already frame
// the section.
export function CurrencySplitCard({
  currencySplit,
  homeCurrency,
}: CurrencySplitCardProps) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-8 gap-y-3 px-1 pt-1 md:grid-cols-[auto_1fr_auto]">
      <div>
        <h3 className="m-0 text-body font-semibold">Gasto por moneda</h3>
        <p className="m-0 text-caption text-[var(--text-faint)]">
          Total{' '}
          <span className="font-mono tabular-nums">
            {formatCurrency(currencySplit.total, homeCurrency)}
          </span>
        </p>
      </div>
      <SplitBar pctUSD={currencySplit.pctUSD} pctUYU={currencySplit.pctUYU} />
      <div className="flex flex-wrap gap-6">
        {[
          {
            label: 'Dólares',
            pct: currencySplit.pctUSD,
            amount: currencySplit.USD,
            swatch: 'bg-[var(--brand)]',
          },
          {
            label: 'Pesos',
            pct: currencySplit.pctUYU,
            amount: currencySplit.UYU,
            swatch: 'bg-[var(--accent)]',
          },
        ].map(({ label, pct, amount, swatch }) => (
          <div key={label} className="flex items-center gap-[10px]">
            <span
              className={`h-[10px] w-[10px] shrink-0 rounded-[3px] ${swatch}`}
            />
            <div>
              <div className="text-[13px] font-semibold">
                {label} · {Math.round(pct)}%
              </div>
              <div className="font-mono text-[12px] text-muted-foreground">
                {formatCurrency(amount, homeCurrency)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
