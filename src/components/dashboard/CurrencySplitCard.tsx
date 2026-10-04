// Gasto por moneda — single split bar + legend.

import type { Currency } from '../../models'
import type { CurrencySplitData } from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'
import { Card } from '../ui/card'

function SplitBar({ pctUSD, pctUYU }: { pctUSD: number; pctUYU: number }) {
  return (
    <div className="mb-[16px] flex h-[10px] overflow-hidden rounded-[5px] bg-[var(--surface-2)]">
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
  periodRange: string | null
  homeCurrency: Currency
}

export function CurrencySplitCard({
  currencySplit,
  periodRange,
  homeCurrency,
}: CurrencySplitCardProps) {
  return (
    <Card className="p-6">
      <div className="mb-[14px] flex items-baseline justify-between">
        <div>
          <h2 className="m-0 font-[family-name:var(--font-sans)] text-[16px] font-semibold">
            Gasto por moneda
          </h2>
          {periodRange && (
            <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
              {periodRange}
            </p>
          )}
        </div>
        <span className="text-[13px] text-muted-foreground">
          Total {formatCurrency(currencySplit.total, homeCurrency)}
        </span>
      </div>
      <SplitBar pctUSD={currencySplit.pctUSD} pctUYU={currencySplit.pctUYU} />
      <div className="flex flex-wrap gap-[32px]">
        <div className="flex items-center gap-[10px]">
          <span className="h-[10px] w-[10px] shrink-0 rounded-[3px] bg-[var(--brand)]" />
          <div>
            <div className="text-[13px] font-semibold">
              Dólares · {Math.round(currencySplit.pctUSD)}%
            </div>
            <div className="font-mono text-[12px] text-muted-foreground">
              {formatCurrency(currencySplit.USD, homeCurrency)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          <span className="h-[10px] w-[10px] shrink-0 rounded-[3px] bg-[var(--accent)]" />
          <div>
            <div className="text-[13px] font-semibold">
              Pesos · {Math.round(currencySplit.pctUYU)}%
            </div>
            <div className="font-mono text-[12px] text-muted-foreground">
              {formatCurrency(currencySplit.UYU, homeCurrency)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
