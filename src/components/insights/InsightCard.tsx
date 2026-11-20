import { House } from 'lucide-react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { CategoryBadge } from '../CategoryBadge'
import { formatCurrency } from '../../utils/formatting'
import {
  MARK_AS_HOUSEHOLD,
  householdValueLabel,
} from '../../services/household/household-copy'
import type { TransactionsFilter } from '../../models'
import type { InsightActions } from '../../services/insights/insight-actions'
import type {
  Insight,
  InsightSeverity,
} from '../../services/insights/insight-generator'

const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  high: 'var(--neg)',
  medium: 'var(--accent)',
  low: 'var(--text-faint)',
}

interface InsightCardProps {
  insight: Insight
  actions: InsightActions
  onDrill: (filter: TransactionsFilter) => void
  /** Absent: the card offers no Hogar control (no write handler). */
  onMarkHousehold?: () => void
  marking: boolean
}

/** One insight: the text, the amount, its drill and its Hogar action. */
export function InsightCard({
  insight,
  actions,
  onDrill,
  onMarkHousehold,
  marking,
}: InsightCardProps) {
  const { drill, household } = actions
  return (
    <Card
      className="p-4"
      style={{ borderLeft: `3px solid ${SEVERITY_COLOR[insight.severity]}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="min-w-[200px] flex-1">
          <p className="mx-0 mt-0 mb-[4px] text-[14px] font-semibold">
            {insight.title}
          </p>
          <p className="m-0 text-[13px] text-muted-foreground">
            {insight.narrative}
          </p>
          {insight.category && (
            <div className="mt-[8px]">
              <CategoryBadge categoryId={insight.category} size="sm" />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[6px] text-right">
          {typeof insight.amount === 'number' && (
            <p className="m-0 font-mono text-[16px] font-semibold">
              {insight.amount < 0 ? '−' : ''}
              {formatCurrency(Math.abs(insight.amount), insight.currency)}
            </p>
          )}
          {drill && (
            <button
              onClick={() => onDrill(drill.filter)}
              className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-semibold text-[var(--brand-text)]"
            >
              {drill.label}
            </button>
          )}
          {household?.state === 'offer' && onMarkHousehold && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkHousehold}
              disabled={marking}
              aria-label={
                marking
                  ? undefined
                  : `${MARK_AS_HOUSEHOLD}: ${insight.merchant ?? ''}`
              }
            >
              <House size={14} aria-hidden="true" />
              {marking ? 'Marcando…' : MARK_AS_HOUSEHOLD}
            </Button>
          )}
          {household?.state === 'done' && (
            <span className="text-[12px] text-[var(--text-faint)]">
              {householdValueLabel(true)}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
