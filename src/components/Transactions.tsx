import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from './ui/page-header'
import { toast } from 'sonner'
import {
  NeedsConfirmationError,
  PartialWriteError,
  userErrorMessage,
} from '../utils/user-error'
import {
  requireRepository,
  type Repository,
} from '../services/repository/repository'
import { countSimilarEditReach } from '../services/descriptions/similar-transactions'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Slash,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from './ui/button'
import { cn } from './ui/utils'
import { Category } from '../models'
import type { Transaction } from '../models'
import { getCategoryDisplay } from '../utils/category-display'
import { useTransactionFiltering } from '../hooks/useTransactionFiltering'
import { useClickOutside } from '../hooks/useClickOutside'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { EditTransactionDraft } from './EditTransactionDialog'
import { BulkEditDialog } from './BulkEditDialog'
import { SplitTransactionDialog } from './SplitTransactionDialog'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { fitMonoFontSize, formatCurrency } from '../utils/formatting'
import { toDateKey, todayAsUtcDate } from '../utils/date-utils'
import type { Currency } from '../models'
import { exportTransactions } from '../services/export/export'
import { useConfirm } from './ConfirmDialog'
import {
  addCustomCategoryWithSync,
  DEFAULT_CATEGORY_COLOR,
} from '../services/categories/category-store'
import {
  buildCategorySuggestions,
  buildTagSuggestions,
} from '../services/suggestions/suggestions'
import { sumCountedTotals } from '../services/spending/spending-rules'
import {
  DEFAULT_URL_FILTERS,
  serializeFilterParams,
  type UrlFilterState,
  type UrlPeriod,
} from '../services/filters/url-filters'

/* ---- Period helpers ---- */
const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const MONTHS_ES_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

type Period =
  | { mode: 'month'; y: number; m: number }
  | { mode: 'recent'; n: number; anchor: Date }
  | { mode: 'all' }
  | { mode: 'range'; from: string; to: string }

// Transaction dates are calendar days at UTC midnight (#58): months, ranges
// and the newest row are all read in UTC, the same calendar months Resumen
// sums — so a drill-through holds exactly the rows of the number clicked.
function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d))
}

function periodRange(period: Period): { from: string; to: string } {
  if (period.mode === 'month') {
    return {
      from: toDateKey(utcDay(period.y, period.m, 1)),
      to: toDateKey(utcDay(period.y, period.m + 1, 0)),
    }
  }
  if (period.mode === 'recent') {
    const y = period.anchor.getUTCFullYear()
    const m = period.anchor.getUTCMonth()
    return {
      from: toDateKey(utcDay(y, m - (period.n - 1), 1)),
      to: toDateKey(utcDay(y, m + 1, 0)),
    }
  }
  if (period.mode === 'range') {
    return { from: period.from, to: period.to }
  }
  return { from: '', to: '' }
}

function getPeriodLabel(period: Period): string {
  if (period.mode === 'month') return `${MONTHS_ES[period.m]} ${period.y}`
  if (period.mode === 'recent') return `Últimos ${period.n} meses`
  if (period.mode === 'all') return 'Todo el período'
  if (period.mode === 'range') {
    const f = period.from
      ? period.from.slice(8) + '/' + period.from.slice(5, 7)
      : '…'
    const t = period.to ? period.to.slice(8) + '/' + period.to.slice(5, 7) : '…'
    return `${f} → ${t}`
  }
  return 'Período'
}

/* ---- MonthNav ---- */
function MonthNav({
  period,
  setPeriod,
  newest,
}: {
  period: Period
  setPeriod: (p: Period) => void
  newest: Date
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const newestY = newest.getUTCFullYear()
  const newestM = newest.getUTCMonth()
  const today = todayAsUtcDate()
  const anchorY = period.mode === 'month' ? period.y : newestY
  const anchorM = period.mode === 'month' ? period.m : newestM
  const [gridYear, setGridYear] = useState(anchorY)

  useEffect(() => {
    if (open) {
      setGridYear(period.mode === 'month' ? period.y : newestY)
    }
  }, [open, period, newestY])

  function shift(dir: -1 | 1) {
    const base =
      period.mode === 'month'
        ? { y: period.y, m: period.m }
        : { y: anchorY, m: anchorM }
    const d = utcDay(base.y, base.m + dir, 1)
    setPeriod({ mode: 'month', y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  const isMonthMode = period.mode === 'month'
  const nextDisabled =
    isMonthMode && period.y === newestY && period.m >= newestM

  return (
    <div className="relative inline-flex" ref={ref}>
      <div className="inline-flex items-stretch overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <button
          onClick={() => shift(-1)}
          title="Mes anterior"
          className="grid w-[36px] cursor-pointer place-items-center border-none bg-transparent p-0 text-[var(--text-muted)]"
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'var(--muted)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <ChevronLeft size={17} />
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex min-w-[168px] cursor-pointer items-center justify-center gap-[9px] border-r border-l border-[var(--border)] px-[14px] py-0 text-[var(--text)] [font:inherit]',
            open ? 'bg-[var(--muted)]' : 'bg-transparent'
          )}
        >
          <Calendar size={14} className="text-[var(--text-muted)]" />
          <span className="text-[14px] font-semibold">
            {getPeriodLabel(period)}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[var(--text-muted)]"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => shift(1)}
          title="Mes siguiente"
          disabled={nextDisabled}
          className={cn(
            'grid w-[36px] place-items-center border-none bg-transparent p-0 text-[var(--text-muted)]',
            nextDisabled ? 'cursor-not-allowed opacity-[0.4]' : 'cursor-pointer'
          )}
          onMouseEnter={(e) => {
            if (!nextDisabled)
              (e.currentTarget as HTMLElement).style.background = 'var(--muted)'
          }}
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {open && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-[40] w-[300px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-[14px] shadow-[var(--shadow-lg)]">
          {/* Quick options */}
          <div className="mb-[12px] flex flex-wrap gap-[6px]">
            {[
              {
                // The shortcut jumps to the newest month with data; only call
                // it "este mes" when that is today's month (today = the local
                // calendar day, as a UTC calendar date).
                label:
                  newestY === today.getUTCFullYear() &&
                  newestM === today.getUTCMonth()
                    ? 'Este mes'
                    : 'Último mes',
                val: {
                  mode: 'month' as const,
                  y: newestY,
                  m: newestM,
                },
              },
              {
                label: 'Últimos 3 meses',
                val: { mode: 'recent' as const, n: 3, anchor: newest },
              },
              {
                label: 'Este año',
                val: {
                  mode: 'range' as const,
                  from: `${newestY}-01-01`,
                  to: toDateKey(newest),
                },
              },
              { label: 'Todo', val: { mode: 'all' as const } },
            ].map((q) => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  setPeriod(q.val)
                  setOpen(false)
                }}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <hr className="mx-[-14px] mt-0 mb-[12px] border-t border-[var(--border)]" />
          {/* Year nav */}
          <div className="mb-[10px] flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-[28px] w-[28px] p-0!"
              onClick={() => setGridYear((y) => y - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span className="font-[family-name:var(--font-mono)] text-[14px] font-semibold">
              {gridYear}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-[28px] w-[28px] p-0!"
              disabled={gridYear >= newestY}
              onClick={() => setGridYear((y) => y + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-[repeat(3,1fr)] gap-[6px]">
            {MONTHS_ES_SHORT.map((mo, i) => {
              const isFuture =
                gridYear > newestY || (gridYear === newestY && i > newestM)
              const isSel =
                period.mode === 'month' &&
                period.y === gridYear &&
                period.m === i
              return (
                <Button
                  key={i}
                  variant={isSel ? 'default' : 'outline'}
                  size="sm"
                  disabled={isFuture}
                  className="px-0 py-[7px] disabled:opacity-[0.35]"
                  onClick={() => {
                    setPeriod({ mode: 'month', y: gridYear, m: i })
                    setOpen(false)
                  }}
                >
                  {mo}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

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

function TotalsStrip({
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

/* ---- BulkBar ---- */
function BulkBar({
  count,
  total,
  onSelectAll,
  onClear,
  onCategorize,
  onEdit,
  onAuto,
  onIgnore,
  onDelete,
  isAutoCategorizing,
  isBusy,
  categorySuggestions,
}: {
  count: number
  total: number
  onSelectAll: () => void
  onClear: () => void
  onCategorize: (category: string) => void
  onEdit: () => void
  onAuto: () => void
  onIgnore: () => void
  onDelete: () => void
  isAutoCategorizing: boolean
  isBusy: boolean
  categorySuggestions: string[]
}) {
  const [catOpen, setCatOpen] = useState(false)
  const catRef = useRef<HTMLDivElement>(null)
  useClickOutside(catRef, () => setCatOpen(false))

  return (
    <div
      role="region"
      aria-label="Acciones de selección"
      // Below md the bar spans the screen and wraps: count, "select all" and
      // × on the first row, the actions on the rows under it (#194). z-40
      // keeps it under dialog overlays (z-50).
      className="fixed inset-x-4 bottom-4 z-40 [animation:fadeUp_0.2s_both] md:inset-x-auto md:bottom-[26px] md:left-[calc(50%+var(--sidebar-w,252px)/2)] md:[transform:translateX(-50%)]"
    >
      <div className="flex items-center gap-[10px] rounded-[999px] border border-[var(--border)] bg-[var(--surface)] py-[10px] pr-[12px] pl-[16px] shadow-[var(--shadow-lg)] max-md:flex-wrap max-md:rounded-[16px]">
        <span
          role="status"
          aria-live="polite"
          className="text-[14px] font-semibold whitespace-nowrap"
        >
          {count} seleccionada{count !== 1 ? 's' : ''}
        </span>

        {count < total && (
          <button
            onClick={onSelectAll}
            disabled={isBusy}
            className="cursor-pointer border-none bg-transparent bg-none p-0 text-[13px] whitespace-nowrap text-[var(--brand)]"
          >
            Seleccionar las {total} transacciones
          </button>
        )}

        <span className="h-[22px] w-[1px] bg-[var(--border)] max-md:hidden" />

        <div
          role="group"
          aria-label="Acciones"
          className="relative flex gap-[4px] max-md:order-last max-md:w-full max-md:flex-wrap"
          ref={catRef}
        >
          {/* Quick categorize */}
          <button
            onClick={() => setCatOpen((o) => !o)}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            <Tag size={13} />
            Categorizar
          </button>

          {catOpen && (
            <div className="absolute bottom-[calc(100%+10px)] left-0 z-[80] max-h-[280px] w-[220px] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-[6px] shadow-[var(--shadow-lg)]">
              {categorySuggestions.map((cat) => {
                const { label, color } = getCategoryDisplay(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      onCategorize(cat)
                      setCatOpen(false)
                    }}
                    className="flex w-full cursor-pointer items-center gap-[9px] rounded-[7px] border-none bg-transparent px-[9px] py-[7px] [font:inherit] text-[13px]! text-[var(--text)]"
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        'var(--muted)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        'transparent')
                    }
                  >
                    <span
                      className="h-[8px] w-[8px] shrink-0 rounded-[3px]"
                      style={{ background: color }}
                    />
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Full edit dialog */}
          <button
            onClick={onEdit}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
            aria-label="Editar seleccionadas"
          >
            <Pencil size={13} />
            Editar
          </button>

          <button
            onClick={onAuto}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            {isAutoCategorizing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {isAutoCategorizing ? 'Auto-categorizando...' : 'Auto-categorizar'}
          </button>

          <button
            onClick={onIgnore}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            <Slash size={13} />
            Ignorar
          </button>

          <button
            onClick={onDelete}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap text-[var(--neg)]"
          >
            <Trash2 size={13} />
            Eliminar
          </button>
        </div>

        <span className="h-[22px] w-[1px] bg-[var(--border)] max-md:hidden" />

        <button
          onClick={onClear}
          title="Deseleccionar"
          disabled={isBusy}
          className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[999px] border-none bg-transparent text-[var(--text-muted)] max-md:ml-auto"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

type DeleteResult = { removed: Transaction[]; reversible: boolean }

function isDeleteResult(value: unknown): value is DeleteResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as DeleteResult).removed)
  )
}

// "1 transacción eliminada" / "3 transacciones eliminadas" from a stem.
interface BulkStep {
  label: string
  run: () => Promise<unknown>
}

/**
 * Runs a bulk edit's steps (category, then each tag) in order and returns
 * the most rows any step updated. When a step saves only some rows, the
 * PartialWriteError it throws gets a retry that resumes the chain: that
 * step's failed rows, then every step that never ran.
 */
async function runBulkSteps(
  steps: BulkStep[],
  onApplied: (label: string) => void = () => {}
): Promise<number> {
  let updated = 0
  for (let i = 0; i < steps.length; i++) {
    let result: unknown
    try {
      result = await steps[i].run()
    } catch (error) {
      if (error instanceof PartialWriteError && error.retry) {
        const rest = steps.slice(i + 1)
        const retryStep = error.retry
        throw new PartialWriteError(
          error.message,
          error.done,
          error.total,
          () =>
            runBulkSteps([{ label: steps[i].label, run: retryStep }, ...rest]),
          error.result
        )
      }
      throw error
    }
    onApplied(steps[i].label)
    const stepUpdated = (result as { updated?: number } | undefined)?.updated
    updated = Math.max(updated, stepUpdated ?? 0)
  }
  return updated
}

function txDone(count: number, participleStem: string): string {
  return count === 1
    ? `1 transacción ${participleStem}a`
    : `${count} transacciones ${participleStem}as`
}

interface BaseTransactionsProps {
  transactions: Transaction[]
  // Filters to start from (parsed from the URL). Read once; the parent
  // remounts the view to apply a new set.
  initialFilters?: UrlFilterState
  // Called with the serialized filter state whenever it changes, so the
  // parent can keep the URL in sync.
  onFiltersChange?: (search: string) => void
  homeCurrency?: string
  fxRate?: number
  // Mutation handlers reject on failure and resolve with what changed; the
  // component only reports success after they resolve.
  onUpdateTransaction?: (
    transactionId: string,
    updates: {
      displayDescription?: string
      // null clears it ("Sin categoría"); absent leaves it alone.
      category?: string | null
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ) => Promise<{ affected: number }>
  onAutoCategorizeTransactions?: (
    transactionIds: string[]
  ) => Promise<{ categorized: number }>
  onBulkCategorize?: (
    transactionIds: string[],
    category: string
  ) => Promise<{ updated: number }>
  onBulkTag?: (
    transactionIds: string[],
    tag: string
  ) => Promise<{ updated: number }>
  onSplitTransaction?: (
    transactionId: string,
    parts: Array<{ description: string; amount: number; category?: string }>
  ) => Promise<{ parts: number }>
  onUnsplitTransaction?: (transactionId: string) => Promise<void>
  // Offered on error toasts so the user can re-sync after a partial write.
  onReload?: () => void
  // The signed-in user's repository: a category created inline saves there.
  repository?: Repository | null
}

// Deleting offers "Deshacer", so whoever wires a delete handler must also
// wire the restore — enforced by the type rather than remembered.
type DeleteProps =
  | {
      onDeleteTransaction?: never
      onBulkDelete?: never
      onRestoreTransactions?: never
    }
  | {
      onDeleteTransaction?: (
        transactionId: string,
        options?: { allowIrreversible?: boolean }
      ) => Promise<DeleteResult>
      onBulkDelete?: (
        transactionIds: string[],
        options?: { allowIrreversible?: boolean }
      ) => Promise<DeleteResult>
      onRestoreTransactions: (
        transactions: Transaction[]
      ) => Promise<{ restored: number }>
    }

type TransactionsProps = BaseTransactionsProps & DeleteProps

export function Transactions({
  transactions,
  initialFilters = DEFAULT_URL_FILTERS,
  onFiltersChange,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onUpdateTransaction,
  onDeleteTransaction,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkDelete,
  onBulkTag,
  onSplitTransaction,
  onUnsplitTransaction,
  onRestoreTransactions,
  onReload,
  repository,
}: TransactionsProps) {
  /* ---- Period state ---- */
  const [period, setPeriod] = useState<Period>(() => {
    const newest =
      transactions.length > 0
        ? new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
        : todayAsUtcDate()
    const fromUrl = initialFilters.period
    if (fromUrl) {
      return fromUrl.mode === 'recent'
        ? { mode: 'recent', n: fromUrl.n, anchor: newest }
        : fromUrl
    }
    // A link that filters by category/account/currency but names no period
    // means all time; a plain visit starts on the newest month.
    const deepLinked =
      initialFilters.categories.length > 0 ||
      initialFilters.accounts.length > 0 ||
      initialFilters.currency !== 'all'
    if (deepLinked || transactions.length === 0) return { mode: 'all' }
    return {
      mode: 'month',
      y: newest.getUTCFullYear(),
      m: newest.getUTCMonth(),
    }
  })

  const {
    searchTerm,
    setSearchTerm,
    merchantFilter,
    setMerchantFilter,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter,
    categoryFilters,
    setCategoryFilters,
    accountFilters,
    setAccountFilters,
    currencyFilter,
    setCurrencyFilter,
    typeFilter,
    setTypeFilter,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
    showIgnored,
    setShowIgnored,
    sortField,
    sortDirection,
    handleSort,
    allFilteredTransactions,
    filteredTransactions,
    ignoredCount,
    availableCategories,
    hasActiveFilters,
    newestDate,
    currentPage,
    setCurrentPage,
    safeTotalPages,
    startIndex,
    paginatedTransactions,
    displayedRowCount,
    paginatedTransactionIds,
    filteredTransactionIds,
    clearAllFilters,
  } = useTransactionFiltering({
    transactions,
    initial: initialFilters,
    initialDateRange: periodRange(period),
  })

  // Clearing filters also clears the period: it is part of what the URL
  // records, and the table already shows every date once the dates clear.
  function clearFiltersAndPeriod() {
    clearAllFilters()
    setPeriod({ mode: 'all' })
  }

  // Keep the URL in step with the filters (the parent decides how).
  useEffect(() => {
    if (!onFiltersChange) return
    const urlPeriod: UrlPeriod =
      period.mode === 'recent' ? { mode: 'recent', n: period.n } : period
    onFiltersChange(
      serializeFilterParams({
        search: searchTerm,
        merchant: merchantFilter,
        categories: categoryFilters,
        accounts: accountFilters.filter(
          (a): a is 'credit_card' | 'bank_account' =>
            a === 'credit_card' || a === 'bank_account'
        ),
        currency: currencyFilter,
        type: typeFilter,
        min: minAmount,
        max: maxAmount,
        showIgnored,
        period: urlPeriod,
      })
    )
  }, [
    onFiltersChange,
    period,
    searchTerm,
    merchantFilter,
    categoryFilters,
    accountFilters,
    currencyFilter,
    typeFilter,
    minAmount,
    maxAmount,
    showIgnored,
  ])

  useEffect(() => {
    const range = periodRange(period)
    setDateFromFilter(range.from)
    setDateToFilter(range.to)
  }, [period, setDateFromFilter, setDateToFilter])

  const newestForNav =
    newestDate ??
    (transactions.length > 0
      ? new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
      : todayAsUtcDate())

  /* ---- Edit state ---- */
  // Rows with a mutation in flight. A set, not a single id, so two
  // overlapping deletes don't re-enable each other's buttons.
  const [pendingTransactionIds, setPendingTransactionIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  function setPending(transactionId: string, pending: boolean) {
    setPendingTransactionIds((current) => {
      const next = new Set(current)
      if (pending) next.add(transactionId)
      else next.delete(transactionId)
      return next
    })
  }

  function reportError(error: unknown, fallback: string, prefix = '') {
    // Some rows saved and are already shown (#60): say how many, offer to
    // retry just the rest, and keep the undo for what a delete did remove.
    if (error instanceof PartialWriteError) {
      if (isDeleteResult(error.result) && error.result.removed.length > 0) {
        reportDeleted(error.result)
      }
      const retry = error.retry
      toast.error(
        prefix + (retry ? `${error.message} — reintentar` : error.message),
        retry
          ? {
              action: {
                label: 'Reintentar',
                onClick: () => {
                  retry().then(
                    // Rows a retried delete removed get their own undo.
                    (result) =>
                      isDeleteResult(result)
                        ? reportDeleted(result)
                        : toast.success('Cambios guardados'),
                    (retryError: unknown) => reportError(retryError, fallback)
                  )
                },
              },
            }
          : onReload
            ? { action: { label: 'Recargar', onClick: onReload } }
            : {}
      )
      return
    }
    toast.error(
      userErrorMessage(error, fallback),
      onReload ? { action: { label: 'Recargar', onClick: onReload } } : {}
    )
  }

  // A reversible delete gets an undo action; an irreversible one (already
  // confirmed) just reports what happened.
  function reportDeleted(result: DeleteResult) {
    const message = txDone(result.removed.length, 'eliminad')
    if (!result.reversible || !onRestoreTransactions) {
      toast.success(message)
      return
    }
    const restore = onRestoreTransactions
    toast(message, {
      duration: 8000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          toast.promise(restore(result.removed), {
            loading: 'Restaurando…',
            success: ({ restored }) => txDone(restored, 'restaurad'),
            error: (error) =>
              userErrorMessage(error, 'No se pudo deshacer la eliminación'),
          })
        },
      },
    })
  }

  // Tries a delete without confirmation; only when the handler says it
  // can't be undone does it ask, then retries with permission.
  async function deleteWithConfirmation(
    run: (allowIrreversible: boolean) => Promise<DeleteResult>,
    confirm: { title: string; description: string }
  ): Promise<DeleteResult | null> {
    try {
      return await run(false)
    } catch (error) {
      if (!(error instanceof NeedsConfirmationError)) throw error
    }
    const confirmed = await confirmDeletion({
      ...confirm,
      confirmLabel: 'Eliminar',
    })
    return confirmed ? run(true) : null
  }
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<
    string[]
  >([])
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false)
  const [isBulkOperating, setIsBulkOperating] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkEditCategory, setBulkEditCategory] = useState('')
  const [bulkEditTagList, setBulkEditTagList] = useState<string[]>([])
  const [bulkCategoryPickerOpen, setBulkCategoryPickerOpen] = useState(false)
  const [bulkCategorySearch, setBulkCategorySearch] = useState('')
  const [bulkTagPickerOpen, setBulkTagPickerOpen] = useState(false)
  const [bulkTagSearch, setBulkTagSearch] = useState('')

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)
  const { confirm: confirmDeletion, dialog: confirmDialog } = useConfirm()

  const [splittingTransaction, setSplittingTransaction] =
    useState<Transaction | null>(null)
  const [splitPending, setSplitPending] = useState(false)

  // Not memoized: custom categories live outside React state, and the list
  // is short, so rebuilding it each render keeps a category created in the
  // edit dialog visible to the bulk pickers.
  const categorySuggestions = buildCategorySuggestions()

  const tagSuggestions = useMemo(
    () => buildTagSuggestions(transactions.flatMap((tx) => tx.tags ?? [])),
    [transactions]
  )

  useEffect(() => {
    const validIds = new Set(transactions.map((transaction) => transaction.id))
    setSelectedTransactionIds((current) =>
      current.filter((transactionId) => validIds.has(transactionId))
    )
  }, [transactions])

  // Same matching the apply-to-similar write uses, so the number the
  // dialog shows is the number of rows the save will touch.
  function countSimilar(transaction: Transaction, renamed: boolean) {
    return countSimilarEditReach(transactions, transaction, renamed)
  }

  async function handleCreateCategory(label: string) {
    try {
      const created = await addCustomCategoryWithSync(
        requireRepository(repository),
        {
          label,
          color: DEFAULT_CATEGORY_COLOR,
          icon: '🏷️',
        }
      )
      return created
    } catch (error) {
      reportError(error, 'No se pudo crear la categoría')
      return undefined
    }
  }

  async function handleSaveEditTransaction(draft: EditTransactionDraft) {
    if (!onUpdateTransaction || !editingTransaction) return
    const editingId = editingTransaction.id
    setPending(editingId, true)
    try {
      const { affected } = await onUpdateTransaction(editingId, {
        displayDescription: draft.description,
        category: draft.category,
        tags: draft.tags,
        applyScope: draft.applyScope,
      })
      toast.success(
        affected > 1
          ? `Cambios aplicados a ${affected} transacciones`
          : 'Cambios guardados'
      )
      setEditingTransaction(null)
    } catch (error) {
      // The dialog stays open so the user can retry.
      reportError(error, 'No se pudieron guardar los cambios')
    } finally {
      setPending(editingId, false)
    }
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    if (!onDeleteTransaction) return
    setPending(transaction.id, true)
    try {
      const result = await deleteWithConfirmation(
        (allowIrreversible) =>
          onDeleteTransaction(transaction.id, { allowIrreversible }),
        {
          title: '¿Eliminar transacción dividida?',
          description:
            'Las partes divididas se eliminan definitivamente. Esta acción no se puede deshacer.',
        }
      )
      if (result) reportDeleted(result)
    } catch (error) {
      reportError(error, 'No se pudo eliminar la transacción')
    } finally {
      setPending(transaction.id, false)
    }
  }

  async function handleConfirmSplit(
    parts: Array<{ description: string; amount: number; category?: string }>
  ) {
    if (!splittingTransaction || !onSplitTransaction) return
    setSplitPending(true)
    try {
      const result = await onSplitTransaction(splittingTransaction.id, parts)
      toast.success(`Transacción dividida en ${result.parts} partes`)
      setSplittingTransaction(null)
    } catch (error) {
      reportError(error, 'No se pudo dividir la transacción')
    } finally {
      setSplitPending(false)
    }
  }

  async function handleUnsplit(transaction: Transaction) {
    if (!onUnsplitTransaction) return
    const confirmed = await confirmDeletion({
      title: '¿Restaurar transacción?',
      description:
        'Se eliminarán las partes divididas y la transacción original se restaurará.',
      confirmLabel: 'Restaurar',
    })
    if (!confirmed) return
    setPending(transaction.id, true)
    try {
      await onUnsplitTransaction(transaction.id)
      toast.success('División deshecha')
    } catch (error) {
      reportError(error, 'No se pudo restaurar la transacción')
    } finally {
      setPending(transaction.id, false)
    }
  }

  function toggleTransactionSelection(transactionId: string, checked: boolean) {
    setSelectedTransactionIds((current) => {
      if (checked) {
        return current.includes(transactionId)
          ? current
          : [...current, transactionId]
      }
      return current.filter((id) => id !== transactionId)
    })
  }

  function mergeSelectedTransactionIds(transactionIds: string[]) {
    setSelectedTransactionIds((current) => {
      const next = new Set(current)
      transactionIds.forEach((transactionId) => next.add(transactionId))
      return Array.from(next)
    })
  }

  function handleSelectCurrentPage() {
    mergeSelectedTransactionIds(paginatedTransactionIds)
  }

  function handleSelectAllFiltered() {
    mergeSelectedTransactionIds(filteredTransactionIds)
  }

  const isBusy = isAutoCategorizing || isBulkOperating

  async function handleAutoCategorizeSelected() {
    if (
      !onAutoCategorizeTransactions ||
      selectedTransactionIds.length === 0 ||
      isAutoCategorizing
    ) {
      return
    }
    setIsAutoCategorizing(true)
    try {
      const { categorized } = await onAutoCategorizeTransactions(
        selectedTransactionIds
      )
      if (categorized === 0) {
        toast.info(
          'No se encontraron categorías automáticas para las transacciones seleccionadas'
        )
        return
      }
      setSelectedTransactionIds([])
      toast.success(txDone(categorized, 'categorizad'))
    } catch (error) {
      reportError(error, 'No se pudieron categorizar las transacciones')
    } finally {
      setIsAutoCategorizing(false)
    }
  }

  async function handleBulkCategorizeSelected(category: string) {
    if (!onBulkCategorize || selectedTransactionIds.length === 0) return
    setIsBulkOperating(true)
    try {
      const { updated } = await onBulkCategorize(
        selectedTransactionIds,
        category
      )
      setSelectedTransactionIds([])
      toast.success(txDone(updated, 'categorizad'))
    } catch (error) {
      reportError(error, 'No se pudieron categorizar las transacciones')
    } finally {
      setIsBulkOperating(false)
    }
  }

  async function handleBulkIgnore() {
    if (
      !onBulkCategorize ||
      selectedTransactionIds.length === 0 ||
      isBulkOperating
    )
      return
    setIsBulkOperating(true)
    try {
      const { updated } = await onBulkCategorize(
        selectedTransactionIds,
        'ignored'
      )
      setSelectedTransactionIds([])
      toast.success(txDone(updated, 'ignorad'))
    } catch (error) {
      reportError(error, 'No se pudieron ignorar las transacciones')
    } finally {
      setIsBulkOperating(false)
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedTransactionIds.length === 0 || isBulkOperating)
      return
    const ids = selectedTransactionIds
    setIsBulkOperating(true)
    try {
      const result = await deleteWithConfirmation(
        (allowIrreversible) => onBulkDelete(ids, { allowIrreversible }),
        {
          title: `¿Eliminar ${ids.length} transacción${ids.length === 1 ? '' : 'es'}?`,
          description:
            'La selección incluye transacciones divididas: sus partes se eliminan definitivamente. Esta acción no se puede deshacer.',
        }
      )
      if (result) {
        setSelectedTransactionIds([])
        reportDeleted(result)
      }
    } catch (error) {
      reportError(error, 'No se pudieron eliminar las transacciones')
    } finally {
      setIsBulkOperating(false)
    }
  }

  function openBulkEdit() {
    setBulkEditCategory('')
    setBulkEditTagList([])
    setBulkCategorySearch('')
    setBulkTagSearch('')
    setBulkEditOpen(true)
  }

  function closeBulkEdit() {
    setBulkEditOpen(false)
    setBulkCategoryPickerOpen(false)
    setBulkTagPickerOpen(false)
    setBulkCategorySearch('')
    setBulkTagSearch('')
  }

  async function handleBulkEditSave() {
    if (selectedTransactionIds.length === 0 || isBulkOperating) return
    setIsBulkOperating(true)
    // Steps run in sequence; on failure the message says which already
    // applied, so a retry isn't a blind guess.
    const applied: string[] = []
    const ids = selectedTransactionIds
    const steps: BulkStep[] = []
    if (bulkEditCategory && onBulkCategorize) {
      const category = bulkEditCategory
      steps.push({
        label: 'la categoría',
        run: () => onBulkCategorize(ids, category),
      })
    }
    if (onBulkTag) {
      for (const tag of bulkEditTagList) {
        steps.push({
          label: `la etiqueta "${tag}"`,
          run: () => onBulkTag(ids, tag),
        })
      }
    }
    try {
      const updated = await runBulkSteps(steps, (label) => applied.push(label))
      setSelectedTransactionIds([])
      closeBulkEdit()
      if (updated === 0) {
        toast.info('Las transacciones ya tenían esos cambios')
      } else {
        toast.success(txDone(updated, 'actualizad'))
      }
    } catch (error) {
      if (error instanceof PartialWriteError) {
        reportError(
          error,
          'No se pudieron actualizar las transacciones',
          applied.length > 0
            ? `Se aplicó ${applied.join(' y ')}, pero falló el resto: `
            : ''
        )
        return
      }
      const message = userErrorMessage(
        error,
        'No se pudieron actualizar las transacciones'
      )
      toast.error(
        applied.length > 0
          ? `Se aplicó ${applied.join(' y ')}, pero falló el resto: ${message}`
          : message,
        onReload ? { action: { label: 'Recargar', onClick: onReload } } : {}
      )
    } finally {
      setIsBulkOperating(false)
    }
  }

  const selectionCount = selectedTransactionIds.length
  const hasSelection = selectionCount > 0

  const allPageSelected =
    paginatedTransactionIds.length > 0 &&
    paginatedTransactionIds.every((id) => selectedTransactionIds.includes(id))
  const somePageSelected =
    !allPageSelected &&
    paginatedTransactionIds.some((id) => selectedTransactionIds.includes(id))

  function handleHeaderCheckboxChange(checked: boolean) {
    if (checked) {
      handleSelectCurrentPage()
    } else {
      setSelectedTransactionIds((current) =>
        current.filter((id) => !paginatedTransactionIds.includes(id))
      )
    }
  }

  const periodLabelText = getPeriodLabel(period)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transacciones"
        subtitle={
          <>
            {filteredTransactions.length} movimiento
            {filteredTransactions.length !== 1 ? 's' : ''}
            {hasActiveFilters ? ' · filtrado' : ''} · {periodLabelText}
          </>
        }
        actions={
          <>
            <MonthNav
              period={period}
              setPeriod={setPeriod}
              newest={newestForNav}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportTransactions(filteredTransactions, { format: 'csv' })
              }
              className="gap-[6px]"
            >
              <Download size={15} />
              Exportar
            </Button>
          </>
        }
      >
        {merchantFilter && (
          <button
            type="button"
            onClick={() => setMerchantFilter('')}
            aria-label={`Quitar filtro de comercio ${merchantFilter}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs"
          >
            Comercio: <strong>{merchantFilter}</strong>
            <X size={12} aria-hidden />
          </button>
        )}
      </PageHeader>

      {/* Totals strip */}
      <TotalsStrip
        rows={allFilteredTransactions}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        ignoredCount={ignoredCount}
      />

      {/* Floating bulk bar — rendered before table so DOM order puts it first for a11y queries */}
      {hasSelection && (
        <BulkBar
          count={selectionCount}
          total={filteredTransactions.length}
          onSelectAll={handleSelectAllFiltered}
          onClear={() => setSelectedTransactionIds([])}
          onCategorize={(category) => {
            void handleBulkCategorizeSelected(category)
          }}
          onEdit={openBulkEdit}
          onAuto={() => {
            void handleAutoCategorizeSelected()
          }}
          onIgnore={() => {
            void handleBulkIgnore()
          }}
          onDelete={() => {
            void handleBulkDelete()
          }}
          isAutoCategorizing={isAutoCategorizing}
          isBusy={isBusy}
          categorySuggestions={categorySuggestions.filter(
            (c) => c !== Category.Uncategorized
          )}
        />
      )}

      {/* Filters */}
      <TransactionFilters
        searchTerm={searchTerm}
        dateFromFilter={dateFromFilter}
        dateToFilter={dateToFilter}
        categoryFilters={categoryFilters}
        accountFilters={accountFilters}
        currencyFilter={currencyFilter}
        typeFilter={typeFilter}
        minAmount={minAmount}
        maxAmount={maxAmount}
        availableCategories={availableCategories}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchTerm}
        onDateFromChange={setDateFromFilter}
        onDateToChange={setDateToFilter}
        onCategoryFiltersChange={setCategoryFilters}
        onAccountFiltersChange={setAccountFilters}
        onCurrencyChange={setCurrencyFilter}
        onTypeChange={setTypeFilter}
        onMinAmountChange={setMinAmount}
        onMaxAmountChange={setMaxAmount}
        onClearAll={clearFiltersAndPeriod}
      />

      {/* Table */}
      <TransactionTable
        paginatedTransactions={paginatedTransactions}
        selectedTransactionIds={selectedTransactionIds}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        isBusy={isBusy}
        pendingTransactionIds={pendingTransactionIds}
        sortField={sortField}
        sortDirection={sortDirection}
        hasActiveFilters={hasActiveFilters}
        selectionCount={selectionCount}
        totalCount={filteredTransactions.length}
        showIgnored={showIgnored}
        ignoredCount={ignoredCount}
        homeCurrency={homeCurrency}
        fxRate={fxRate}
        onToggleSelect={toggleTransactionSelection}
        onHeaderCheckboxChange={handleHeaderCheckboxChange}
        onSort={handleSort}
        onClearFilters={clearFiltersAndPeriod}
        onShowIgnoredChange={setShowIgnored}
        onEdit={setEditingTransaction}
        onDelete={(transaction) => {
          void handleDeleteTransaction(transaction)
        }}
        onSplit={
          onSplitTransaction
            ? (transaction) => setSplittingTransaction(transaction)
            : undefined
        }
        onUnsplit={
          onUnsplitTransaction
            ? (transaction) => {
                void handleUnsplit(transaction)
              }
            : undefined
        }
      />

      <EditTransactionDialog
        transaction={editingTransaction}
        countSimilar={countSimilar}
        knownTags={tagSuggestions}
        isSaving={
          editingTransaction !== null &&
          pendingTransactionIds.has(editingTransaction.id)
        }
        onCreateCategory={handleCreateCategory}
        onSave={(draft) => {
          void handleSaveEditTransaction(draft)
        }}
        onClose={() => setEditingTransaction(null)}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        selectionCount={selectionCount}
        bulkEditCategory={bulkEditCategory}
        bulkEditTagList={bulkEditTagList}
        bulkCategoryPickerOpen={bulkCategoryPickerOpen}
        bulkTagPickerOpen={bulkTagPickerOpen}
        bulkCategorySearch={bulkCategorySearch}
        bulkTagSearch={bulkTagSearch}
        categorySuggestions={categorySuggestions}
        tagSuggestions={tagSuggestions}
        isBulkOperating={isBulkOperating}
        showCategorySection={Boolean(onBulkCategorize)}
        showTagSection={Boolean(onBulkTag)}
        onBulkEditCategoryChange={setBulkEditCategory}
        onBulkEditTagListChange={setBulkEditTagList}
        onBulkCategoryPickerOpenChange={setBulkCategoryPickerOpen}
        onBulkTagPickerOpenChange={setBulkTagPickerOpen}
        onBulkCategorySearchChange={setBulkCategorySearch}
        onBulkTagSearchChange={setBulkTagSearch}
        onSave={() => {
          void handleBulkEditSave()
        }}
        onCancel={closeBulkEdit}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length === 0
            ? 'Mostrando 0 de 0'
            : `Mostrando ${startIndex + 1}-${startIndex + paginatedTransactions.length} de ${displayedRowCount}`}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-1">
            {(() => {
              const pages: (number | '...')[] = []
              if (safeTotalPages <= 7) {
                for (let i = 1; i <= safeTotalPages; i++) pages.push(i)
              } else {
                pages.push(1)
                if (currentPage > 3) pages.push('...')
                for (
                  let i = Math.max(2, currentPage - 1);
                  i <= Math.min(safeTotalPages - 1, currentPage + 1);
                  i++
                )
                  pages.push(i)
                if (currentPage < safeTotalPages - 2) pages.push('...')
                pages.push(safeTotalPages)
              }
              return pages.map((p, i) =>
                p === '...' ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-1 text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={currentPage === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(p)}
                    className="w-10"
                  >
                    {p}
                  </Button>
                )
              )
            })()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentPage((page) => Math.min(safeTotalPages, page + 1))
            }
            disabled={currentPage === safeTotalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {confirmDialog}

      <SplitTransactionDialog
        open={splittingTransaction !== null}
        transaction={splittingTransaction}
        pending={splitPending}
        onConfirm={handleConfirmSplit}
        onCancel={() => setSplittingTransaction(null)}
      />
    </div>
  )
}
