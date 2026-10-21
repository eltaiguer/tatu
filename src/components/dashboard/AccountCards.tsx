// Resumen account source cards — one per imported account, 3-col grid.

import { CreditCard, DollarSign, Banknote } from 'lucide-react'
import type { Currency, TransactionsFilter } from '../../models'
import type {
  AccountSpend,
  SpendByAccount,
} from '../../services/charts/chart-data'
import { formatCurrency } from '../../utils/formatting'
import { Card } from '../ui/card'
import { DrillTarget } from './DrillTarget'

// The period an account card's own number covers (accounts are imported
// separately, so one global range would be wrong for some of them).
function accountRange(stat: AccountSpend): string {
  if (!stat.first || !stat.last) return 'Sin gastos'
  const fmt = new Intl.DateTimeFormat('es-UY', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const from = fmt.format(stat.first)
  const to = fmt.format(stat.last)
  return from === to ? from : `${from} – ${to}`
}

interface AccountExpenseCardProps {
  icon: React.ElementType
  label: string
  sublabel: string
  stat: AccountSpend
  homeCurrency: Currency
  onOpen?: () => void
}

function AccountExpenseCard({
  icon: Icon,
  label,
  sublabel,
  stat,
  homeCurrency,
  onOpen,
}: AccountExpenseCardProps) {
  const mixed = stat.USD > 0 && stat.UYU > 0
  return (
    <Card className="overflow-hidden p-0">
      <DrillTarget
        onOpen={onOpen}
        label={`Ver los gastos de ${label}`}
        className="flex flex-col gap-[14px] p-5"
      >
        {/* Header */}
        <div className="flex items-center gap-[11px]">
          <span className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[10px] bg-[var(--surface-2)] text-[var(--brand)]">
            <Icon size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="overflow-hidden text-[14px] font-semibold text-ellipsis whitespace-nowrap">
              {label}
            </div>
            <div className="text-[12px] text-[var(--text-faint)]">
              {sublabel}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div>
          <div className="text-[12px] font-medium text-[var(--text-faint)]">
            Gastos
          </div>
          <div className="font-mono mt-[4px] text-[22px] text-[var(--text)]">
            {formatCurrency(stat.conv, homeCurrency)}
          </div>
          {mixed && (
            <div className="font-mono mt-[3px] text-[12px] text-[var(--text-faint)]">
              US$ {Math.round(stat.USD).toLocaleString('es-UY')} · $U{' '}
              {Math.round(stat.UYU).toLocaleString('es-UY')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-[var(--border)] pt-[10px]">
          <div className="mb-[7px] h-[4px] overflow-hidden rounded-[2px] bg-[var(--surface-2)]">
            <div
              className="h-full rounded-[2px] bg-[var(--brand)]"
              style={{ width: `${stat.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[12px] text-[var(--text-faint)]">
            <span>{stat.count} movimientos</span>
            <span className="font-mono">{Math.round(stat.pct)}% del gasto</span>
          </div>
        </div>
      </DrillTarget>
    </Card>
  )
}

interface AccountCardsProps {
  acctSpend: SpendByAccount
  homeCurrency: Currency
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
}

export function AccountCards({
  acctSpend,
  homeCurrency,
  onNavigateToTransactions,
}: AccountCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <AccountExpenseCard
        icon={CreditCard}
        label="Tarjeta de crédito"
        sublabel={accountRange(acctSpend.card)}
        stat={acctSpend.card}
        homeCurrency={homeCurrency}
        onOpen={
          onNavigateToTransactions &&
          (() =>
            onNavigateToTransactions({
              accountType: 'credit_card',
              type: 'debit',
            }))
        }
      />
      <AccountExpenseCard
        icon={DollarSign}
        label="Cuenta USD"
        sublabel={accountRange(acctSpend.usd)}
        stat={acctSpend.usd}
        homeCurrency={homeCurrency}
        onOpen={
          onNavigateToTransactions &&
          (() =>
            onNavigateToTransactions({
              accountType: 'bank_account',
              currency: 'USD',
              type: 'debit',
            }))
        }
      />
      <AccountExpenseCard
        icon={Banknote}
        label="Cuenta $U"
        sublabel={accountRange(acctSpend.uyu)}
        stat={acctSpend.uyu}
        homeCurrency={homeCurrency}
        onOpen={
          onNavigateToTransactions &&
          (() =>
            onNavigateToTransactions({
              accountType: 'bank_account',
              currency: 'UYU',
              type: 'debit',
            }))
        }
      />
    </div>
  )
}
