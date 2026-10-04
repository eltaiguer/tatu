// Movimientos recientes — the latest counted transactions.

import { ArrowRight } from 'lucide-react'
import type { Currency, Transaction, TransactionsFilter } from '../../models'
import { getCategoryDefinition } from '../../services/categories/category-registry'
import { convert } from '../../services/currency/convert'
import { formatCurrency, formatDateCompact } from '../../utils/formatting'
import { getDisplayDescription } from '../../utils/transaction-display'
import { Card } from '../ui/card'
import { IconTile } from '../ui/icon-tile'

interface RecentTransactionsCardProps {
  recentTransactions: Transaction[]
  homeCurrency: Currency
  fxRate: number
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function RecentTransactionsCard({
  recentTransactions,
  homeCurrency,
  fxRate,
  onNavigateToTransactions,
}: RecentTransactionsCardProps) {
  return (
    <Card className="p-6">
      <div className="mb-[14px] flex items-center justify-between">
        <h2 className="m-0 font-[family-name:var(--font-sans)] text-[15px] font-semibold">
          Movimientos recientes
        </h2>
        {onNavigateToTransactions && (
          <button
            onClick={() => onNavigateToTransactions({})}
            className="flex cursor-pointer items-center gap-[4px] border-none bg-transparent text-[13px] font-medium text-[var(--brand)]"
          >
            Ver todos <ArrowRight size={14} />
          </button>
        )}
      </div>
      <div className="flex flex-col">
        {recentTransactions.map((tx, i) => {
          const catDef = getCategoryDefinition(tx.category ?? 'uncategorized')
          const isCredit = tx.type === 'credit'
          const showConverted = tx.currency !== homeCurrency
          const convertedAmt = showConverted
            ? convert(tx.amount, tx.currency, homeCurrency, fxRate)
            : null
          return (
            <div
              key={tx.id}
              className={`flex items-center gap-[12px] px-0 py-[10px] ${
                i < recentTransactions.length - 1
                  ? 'border-b border-[var(--border)]'
                  : 'border-b-0'
              }`}
            >
              <IconTile size="md" color={catDef.color}>
                {catDef.icon}
              </IconTile>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-[14px] font-medium text-ellipsis whitespace-nowrap">
                  {getDisplayDescription(tx)}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {formatDateCompact(tx.date)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className="font-mono block text-[14px]"
                  style={{
                    color: isCredit ? 'var(--pos)' : 'var(--text)',
                  }}
                >
                  {isCredit ? '+' : '−'}
                  {formatCurrency(tx.amount, tx.currency)}
                </span>
                {showConverted &&
                  convertedAmt !== null &&
                  Math.abs(convertedAmt) >= 0.005 && (
                    <span className="font-mono block text-[11px] text-muted-foreground">
                      ≈ {formatCurrency(convertedAmt, homeCurrency)}
                    </span>
                  )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
