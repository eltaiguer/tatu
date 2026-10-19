// Mayores comercios — top merchants, all history in home currency, grouped
// by the merchant key the Transacciones merchant filter matches on.

import type { Currency, TransactionsFilter } from '../../models'
import type { MerchantSpendDatum } from '../../services/charts/chart-data'
import { getCategoryDisplay } from '../../utils/category-display'
import { formatCurrency } from '../../utils/formatting'
import { Card } from '../ui/card'
import { IconTile } from '../ui/icon-tile'
import { DrillTarget } from './DrillTarget'

interface TopMerchantsCardProps {
  topMerchants: MerchantSpendDatum[]
  // Category id -> emoji icon.
  emojiLookup: Map<string, string>
  periodRange: string | null
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function TopMerchantsCard({
  topMerchants,
  emojiLookup,
  periodRange,
  homeCurrency,
  onNavigateToTransactions,
}: TopMerchantsCardProps) {
  return (
    <Card className="p-6">
      <div className="mb-[14px]">
        <h2 className="m-0 font-[family-name:var(--font-sans)] text-[15px] font-semibold">
          Mayores comercios
        </h2>
        {periodRange && (
          <p className="mx-0 mt-[2px] mb-0 text-[11px] text-[var(--text-faint)]">
            {periodRange}
          </p>
        )}
      </div>
      <div className="flex flex-col">
        {topMerchants.map((m, i) => {
          const display = getCategoryDisplay(m.categoryId)
          const emoji = emojiLookup.get(m.categoryId)
          return (
            <DrillTarget
              key={m.key}
              onOpen={
                onNavigateToTransactions &&
                (() =>
                  onNavigateToTransactions({
                    merchant: m.key,
                    type: 'debit',
                  }))
              }
              label={`Ver los gastos en ${m.label}`}
              className="flex items-center gap-3 border-b border-border py-[10px]"
            >
              <span className="font-mono w-[16px] text-[12px] text-muted-foreground">
                {i + 1}
              </span>
              <IconTile size="sm" color={display.color}>
                {emoji ?? (
                  <span
                    className="block h-[8px] w-[8px] rounded-[50%]"
                    style={{ background: display.color }}
                  />
                )}
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-[14px] font-medium text-ellipsis whitespace-nowrap">
                  {m.label}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {m.count} {m.count > 1 ? 'movimientos' : 'movimiento'}
                </div>
              </div>
              <span className="font-mono text-[13px]">
                {formatCurrency(m.total, homeCurrency)}
              </span>
            </DrillTarget>
          )
        })}
      </div>
    </Card>
  )
}
