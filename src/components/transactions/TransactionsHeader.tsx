import type { ReactNode } from 'react'
import { Download, X } from 'lucide-react'
import type { Transaction, UrlPeriod } from '../../models'
import { exportTransactions } from '../../services/export/export'
import { getPeriodLabel } from '../../services/filters/period-label'
import { currentHouseholdRules } from '../../services/household/household'
import { Button } from '../ui/button'
import { PageHeader } from '../ui/page-header'
import { MonthNav } from './MonthNav'

type MonthNavProps = Parameters<typeof MonthNav>[0]

/**
 * The Transacciones page header: the count line, the period picker, the
 * export, the merchant chip, and whatever the view adds under it (children).
 */
export function TransactionsHeader({
  rows,
  filtered,
  period,
  setPeriod,
  monthNav,
  merchantLabel,
  onClearMerchant,
  children,
}: {
  // The rows listed (and exported).
  rows: Transaction[]
  filtered: boolean
  period: UrlPeriod
  setPeriod: (period: UrlPeriod) => void
  monthNav: Omit<MonthNavProps, 'period' | 'setPeriod'>
  // The merchant filter's label, empty when there is none.
  merchantLabel: string
  onClearMerchant: () => void
  children?: ReactNode
}) {
  return (
    <PageHeader
      title="Transacciones"
      subtitle={
        <>
          {rows.length} movimiento{rows.length !== 1 ? 's' : ''}
          {filtered ? ' · filtrado' : ''} · {getPeriodLabel(period)}
        </>
      }
      actions={
        <>
          <MonthNav period={period} setPeriod={setPeriod} {...monthNav} />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportTransactions(rows, {
                format: 'csv',
                householdRules: currentHouseholdRules(),
              })
            }
            className="gap-[6px]"
          >
            <Download size={15} />
            Exportar
          </Button>
        </>
      }
    >
      {merchantLabel && (
        <button
          type="button"
          onClick={onClearMerchant}
          aria-label={`Quitar filtro de comercio ${merchantLabel}`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs"
        >
          Comercio: <strong>{merchantLabel}</strong>
          <X size={12} aria-hidden />
        </button>
      )}
      {children}
    </PageHeader>
  )
}
