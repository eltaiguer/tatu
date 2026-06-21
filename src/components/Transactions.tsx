import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
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
} from 'lucide-react'
import { Button } from './ui/button'
import { Category } from '../models'
import type { Transaction } from '../models'
import { getCategoryDisplay } from '../utils/category-display'
import { getDisplayDescription } from '../utils/transaction-display'
import { useTransactionFiltering } from '../hooks/useTransactionFiltering'
import { useClickOutside } from '../hooks/useClickOutside'
import { EditTransactionDialog } from './EditTransactionDialog'
import { BulkEditDialog } from './BulkEditDialog'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { formatCurrency } from '../utils/formatting'
import { convert } from '../services/currency/convert'
import type { Currency } from '../models'
import { exportTransactions } from '../services/export/export'
import { useConfirm } from './ConfirmDialog'
import {
  addCustomCategory,
  listCustomCategories,
  syncCustomCategoryToCloud,
  DEFAULT_CATEGORY_COLOR,
} from '../services/categories/category-store'
import { isCategoryIgnored } from '../services/categories/category-registry'
import type { TransactionsFilter } from '../models'

/* ---- Period helpers ---- */
const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const MONTHS_ES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

type Period =
  | { mode: 'month'; y: number; m: number }
  | { mode: 'recent'; n: number; anchor: Date }
  | { mode: 'all' }
  | { mode: 'range'; from: string; to: string }

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function periodRange(period: Period): { from: string; to: string } {
  if (period.mode === 'month') {
    const from = new Date(period.y, period.m, 1)
    const to = new Date(period.y, period.m + 1, 0)
    return { from: isoDay(from), to: isoDay(to) }
  }
  if (period.mode === 'recent') {
    const to = period.anchor
    const from = new Date(
      to.getFullYear(),
      to.getMonth() - (period.n - 1),
      1
    )
    return {
      from: isoDay(from),
      to: isoDay(new Date(to.getFullYear(), to.getMonth() + 1, 0)),
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
    const t = period.to
      ? period.to.slice(8) + '/' + period.to.slice(5, 7)
      : '…'
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

  const anchorY =
    period.mode === 'month' ? period.y : newest.getFullYear()
  const anchorM =
    period.mode === 'month' ? period.m : newest.getMonth()
  const [gridYear, setGridYear] = useState(anchorY)

  useEffect(() => {
    if (open) {
      setGridYear(
        period.mode === 'month' ? period.y : newest.getFullYear()
      )
    }
  }, [open, period, newest])

  function shift(dir: -1 | 1) {
    const base =
      period.mode === 'month'
        ? { y: period.y, m: period.m }
        : { y: anchorY, m: anchorM }
    const d = new Date(base.y, base.m + dir, 1)
    setPeriod({ mode: 'month', y: d.getFullYear(), m: d.getMonth() })
  }

  const isMonthMode = period.mode === 'month'
  const nextDisabled =
    isMonthMode &&
    period.y === newest.getFullYear() &&
    period.m >= newest.getMonth()

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={ref}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => shift(-1)}
          title="Mes anterior"
          style={{
            width: 36,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background =
              'var(--muted)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background =
              'transparent')
          }
        >
          <ChevronLeft size={17} />
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            border: 'none',
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            background: open ? 'var(--muted)' : 'transparent',
            color: 'var(--text)',
            font: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '0 14px',
            minWidth: 168,
            justifyContent: 'center',
          }}
        >
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>
            {getPeriodLabel(period)}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: 'var(--text-muted)' }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => shift(1)}
          title="Mes siguiente"
          disabled={nextDisabled}
          style={{
            width: 36,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: nextDisabled ? 'not-allowed' : 'pointer',
            color: 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
            opacity: nextDisabled ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!nextDisabled)
              (e.currentTarget as HTMLElement).style.background =
                'var(--muted)'
          }}
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background =
              'transparent')
          }
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 40,
            width: 300,
            padding: 14,
            boxShadow: 'var(--shadow-lg)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          {/* Quick options */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            {[
              {
                label: 'Este mes',
                val: {
                  mode: 'month' as const,
                  y: newest.getFullYear(),
                  m: newest.getMonth(),
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
                  from: `${newest.getFullYear()}-01-01`,
                  to: isoDay(newest),
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
          <hr style={{ margin: '0 -14px 12px', border: 'none', borderTop: '1px solid var(--border)' }} />
          {/* Year nav */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              style={{ width: 28, height: 28, padding: 0 }}
              onClick={() => setGridYear((y) => y - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {gridYear}
            </span>
            <Button
              variant="ghost"
              size="sm"
              style={{ width: 28, height: 28, padding: 0 }}
              disabled={gridYear >= newest.getFullYear()}
              onClick={() => setGridYear((y) => y + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
          {/* Month grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
            }}
          >
            {MONTHS_ES_SHORT.map((mo, i) => {
              const isFuture =
                gridYear > newest.getFullYear() ||
                (gridYear === newest.getFullYear() && i > newest.getMonth())
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
                  style={{
                    padding: '7px 0',
                    opacity: isFuture ? 0.35 : 1,
                  }}
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
  sub,
  accent,
  icon,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  icon: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        minWidth: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span style={{ color: 'var(--text-muted)', display: 'grid', flexShrink: 0 }}>
          {icon}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: accent ?? 'var(--text)',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</div>
      )}
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
  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    rows.forEach((tx) => {
      if (isCategoryIgnored(tx.category)) return
      const v = convert(
        tx.amount,
        tx.currency as Currency,
        homeCurrency as Currency,
        fxRate
      )
      if (tx.type === 'credit') income += v
      else expense += v
    })
    return { income, expense, net: income - expense }
  }, [rows, homeCurrency, fxRate])

  const cur = homeCurrency as Currency
  const net = totals.net

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <TotalTile
        label="Ingresos"
        icon={<TrendingUp size={14} />}
        value={formatCurrency(totals.income, cur)}
        accent="var(--pos)"
      />
      <TotalTile
        label="Gastos"
        icon={<TrendingDown size={14} />}
        value={formatCurrency(totals.expense, cur)}
      />
      <TotalTile
        label="Balance"
        icon={<Wallet size={14} />}
        value={`${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net), cur)}`}
        accent={net >= 0 ? 'var(--pos)' : 'var(--neg)'}
        sub="Ingresos − gastos"
      />
      <TotalTile
        label="Transferencias"
        icon={<Slash size={14} />}
        value={String(ignoredCount)}
        sub={ignoredCount ? 'Ignoradas · no se cuentan' : 'Ninguna en el período'}
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
      style={{
        position: 'fixed',
        bottom: 26,
        left: 'calc(50% + var(--sidebar-w, 252px) / 2)',
        transform: 'translateX(-50%)',
        zIndex: 70,
        animation: 'fadeUp 0.2s both',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px 10px 16px',
          borderRadius: 999,
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <span
          role="status"
          aria-live="polite"
          style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap' }}
        >
          {count} seleccionada{count !== 1 ? 's' : ''}
        </span>

        {count < total && (
          <button
            onClick={onSelectAll}
            disabled={isBusy}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--brand)',
              fontSize: 12.5,
              padding: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Seleccionar las {total} transacciones
          </button>
        )}

        <span
          style={{ width: 1, height: 22, background: 'var(--border)' }}
        />

        <div
          style={{ display: 'flex', gap: 4, position: 'relative' }}
          ref={catRef}
        >
          {/* Quick categorize */}
          <button
            onClick={() => setCatOpen((o) => !o)}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
            }}
          >
            <Tag size={13} />
            Categorizar
          </button>

          {catOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 10px)',
                left: 0,
                zIndex: 80,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 6,
                width: 220,
                maxHeight: 280,
                overflowY: 'auto',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {categorySuggestions.map((cat) => {
                const { label, color } = getCategoryDisplay(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      onCategorize(cat)
                      setCatOpen(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      width: '100%',
                      padding: '7px 9px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: 7,
                      cursor: 'pointer',
                      font: 'inherit',
                      fontSize: 13,
                      color: 'var(--text)',
                    }}
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
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 3,
                        background: color,
                        flexShrink: 0,
                      }}
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
            }}
            aria-label="Editar seleccionadas"
          >
            <Pencil size={13} />
            Editar
          </button>

          <button
            onClick={onAuto}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
            }}
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
            }}
          >
            <Slash size={13} />
            Ignorar
          </button>

          <button
            onClick={onDelete}
            disabled={isBusy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--neg)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 13,
            }}
          >
            <Trash2 size={13} />
            Eliminar
          </button>
        </div>

        <span
          style={{ width: 1, height: 22, background: 'var(--border)' }}
        />

        <button
          onClick={onClear}
          title="Deseleccionar"
          disabled={isBusy}
          style={{
            width: 30,
            height: 30,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
            borderRadius: 999,
          }}
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

interface TransactionsProps {
  transactions: Transaction[]
  initialFilter?: TransactionsFilter
  homeCurrency?: string
  fxRate?: number
  onUpdateTransaction?: (
    transactionId: string,
    updates: {
      displayDescription?: string
      category?: string
      tags?: string[]
      applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
    }
  ) => Promise<void> | void
  onDeleteTransaction?: (transactionId: string) => Promise<void> | void
  onAutoCategorizeTransactions?: (
    transactionIds: string[]
  ) => Promise<void> | void
  onBulkCategorize?: (
    transactionIds: string[],
    category: string
  ) => Promise<void> | void
  onBulkDelete?: (transactionIds: string[]) => Promise<void> | void
  onBulkTag?: (
    transactionIds: string[],
    tag: string
  ) => Promise<void> | void
}

export function Transactions({
  transactions,
  initialFilter,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onUpdateTransaction,
  onDeleteTransaction,
  onAutoCategorizeTransactions,
  onBulkCategorize,
  onBulkDelete,
  onBulkTag,
}: TransactionsProps) {
  const {
    searchTerm,
    setSearchTerm,
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
    paginatedTransactionIds,
    filteredTransactionIds,
    clearAllFilters,
  } = useTransactionFiltering({ transactions, initialFilter })

  /* ---- Period state ---- */
  const deepLinked = !!(
    initialFilter &&
    (initialFilter.category ||
      (initialFilter.accountType && initialFilter.accountType !== 'all') ||
      (initialFilter.currency && initialFilter.currency !== 'all'))
  )

  const [period, setPeriod] = useState<Period>(() => {
    if (deepLinked || transactions.length === 0) return { mode: 'all' }
    const newest = new Date(
      Math.max(...transactions.map((tx) => tx.date.getTime()))
    )
    return { mode: 'month', y: newest.getFullYear(), m: newest.getMonth() }
  })

  useEffect(() => {
    const range = periodRange(period)
    setDateFromFilter(range.from)
    setDateToFilter(range.to)
  }, [period, setDateFromFilter, setDateToFilter])

  const newestForNav =
    newestDate ??
    (transactions.length > 0
      ? new Date(Math.max(...transactions.map((tx) => tx.date.getTime())))
      : new Date())

  /* ---- Edit state ---- */
  const [pendingTransactionId, setPendingTransactionId] = useState<
    string | null
  >(null)
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
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTagList, setEditTagList] = useState<string[]>([])
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [newTagInput, setNewTagInput] = useState('')
  const [applyScope, setApplyScope] = useState<
    'single' | 'matching_past_and_future' | 'future_matching_only'
  >('single')
  const [editError, setEditError] = useState('')
  const { confirm: confirmDeletion, dialog: confirmDialog } = useConfirm()

  const categorySuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...Object.values(Category),
          ...listCustomCategories().map((c) => c.id),
          editCategory,
        ]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) =>
      getCategoryDisplay(a).label.localeCompare(
        getCategoryDisplay(b).label,
        'es'
      )
    )
  }, [editCategory])

  const filteredCategorySuggestions = useMemo(() => {
    const query = newCategoryInput.trim().toLowerCase()
    const base = categorySuggestions.filter(
      (c) => c !== Category.Uncategorized
    )
    if (!query) return base
    return base.filter((category) => {
      const label = getCategoryDisplay(category).label.toLowerCase()
      return category.toLowerCase().includes(query) || label.includes(query)
    })
  }, [categorySuggestions, newCategoryInput])

  const tagSuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [...transactions.flatMap((tx) => tx.tags ?? []), ...editTagList]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'))
  }, [transactions, editTagList])

  const filteredTagSuggestions = useMemo(() => {
    const query = newTagInput.trim().toLowerCase()
    if (!query) return tagSuggestions
    return tagSuggestions.filter((tag) => tag.toLowerCase().includes(query))
  }, [tagSuggestions, newTagInput])

  useEffect(() => {
    const validIds = new Set(transactions.map((transaction) => transaction.id))
    setSelectedTransactionIds((current) =>
      current.filter((transactionId) => validIds.has(transactionId))
    )
  }, [transactions])

  function startEditTransaction(transaction: Transaction) {
    setEditingTransaction(transaction)
    setEditDescription(getDisplayDescription(transaction))
    setEditCategory(transaction.category ?? '')
    setEditTagList(transaction.tags ?? [])
    setApplyScope('single')
    setCategoryPickerOpen(false)
    setTagPickerOpen(false)
    setNewCategoryInput('')
    setNewTagInput('')
    setEditError('')
  }

  function resetEditState() {
    setEditingTransaction(null)
    setEditDescription('')
    setEditCategory('')
    setEditTagList([])
    setApplyScope('single')
    setCategoryPickerOpen(false)
    setTagPickerOpen(false)
    setNewCategoryInput('')
    setNewTagInput('')
    setEditError('')
  }

  function handleAddCategory() {
    const value = newCategoryInput.trim()
    if (!value) return
    const created = addCustomCategory({
      label: value,
      color: DEFAULT_CATEGORY_COLOR,
      icon: '🏷️',
    })
    setEditCategory(created.id)
    setNewCategoryInput('')
    void syncCustomCategoryToCloud(created.id)
  }

  function handleAddTag(tag: string) {
    const value = tag.trim()
    if (!value || editTagList.includes(value)) return
    setEditTagList((current) => [...current, value])
  }

  function handleAddInlineTag() {
    handleAddTag(newTagInput)
    setNewTagInput('')
  }

  function handleRemoveTag(tag: string) {
    setEditTagList((current) => current.filter((value) => value !== tag))
  }

  async function handleSaveEditTransaction() {
    if (!onUpdateTransaction || !editingTransaction) return
    const trimmedDescription = editDescription.trim()
    if (!trimmedDescription) {
      setEditError('La descripción no puede quedar vacía')
      return
    }
    setPendingTransactionId(editingTransaction.id)
    try {
      await onUpdateTransaction(editingTransaction.id, {
        displayDescription: trimmedDescription,
        category: editCategory.trim() || undefined,
        tags: editTagList,
        applyScope,
      })
      toast.success('Cambios guardados')
      resetEditState()
    } finally {
      setPendingTransactionId(null)
    }
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    if (!onDeleteTransaction) return
    const confirmed = await confirmDeletion({
      title: '¿Eliminar transacción?',
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    setPendingTransactionId(transaction.id)
    try {
      await onDeleteTransaction(transaction.id)
    } finally {
      setPendingTransactionId(null)
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

  const bulkFilteredCategories = useMemo(() => {
    const query = bulkCategorySearch.trim().toLowerCase()
    if (!query) return categorySuggestions
    return categorySuggestions.filter((category) => {
      const label = getCategoryDisplay(category).label.toLowerCase()
      return category.toLowerCase().includes(query) || label.includes(query)
    })
  }, [categorySuggestions, bulkCategorySearch])

  const bulkFilteredTags = useMemo(() => {
    const query = bulkTagSearch.trim().toLowerCase()
    if (!query) return tagSuggestions
    return tagSuggestions.filter((tag) => tag.toLowerCase().includes(query))
  }, [tagSuggestions, bulkTagSearch])

  const isBusy = isAutoCategorizing || isBulkOperating

  async function handleAutoCategorizeSelected() {
    if (
      !onAutoCategorizeTransactions ||
      selectedTransactionIds.length === 0 ||
      isAutoCategorizing
    ) {
      return
    }
    const count = selectedTransactionIds.length
    setIsAutoCategorizing(true)
    try {
      await onAutoCategorizeTransactions(selectedTransactionIds)
      setSelectedTransactionIds([])
      toast.success(
        `${count} transacción${count === 1 ? '' : 'es'} categorizad${count === 1 ? 'a' : 'as'}`
      )
    } finally {
      setIsAutoCategorizing(false)
    }
  }

  async function handleBulkIgnore() {
    if (!onBulkCategorize || selectedTransactionIds.length === 0 || isBulkOperating)
      return
    const count = selectedTransactionIds.length
    setIsBulkOperating(true)
    try {
      await onBulkCategorize(selectedTransactionIds, 'ignored')
      setSelectedTransactionIds([])
      toast.success(
        `${count} transacción${count === 1 ? '' : 'es'} ignorada${count === 1 ? '' : 's'}`
      )
    } finally {
      setIsBulkOperating(false)
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedTransactionIds.length === 0 || isBulkOperating)
      return
    const count = selectedTransactionIds.length
    const confirmed = await confirmDeletion({
      title: `¿Eliminar ${count} transacción${count === 1 ? '' : 'es'}?`,
      description: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    setIsBulkOperating(true)
    try {
      await onBulkDelete(selectedTransactionIds)
      setSelectedTransactionIds([])
      toast.success(
        `${count} transacción${count === 1 ? '' : 'es'} eliminada${count === 1 ? '' : 's'}`
      )
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
    const count = selectedTransactionIds.length
    setIsBulkOperating(true)
    try {
      if (bulkEditCategory && onBulkCategorize) {
        await onBulkCategorize(selectedTransactionIds, bulkEditCategory)
      }
      for (const tag of bulkEditTagList) {
        if (onBulkTag) {
          await onBulkTag(selectedTransactionIds, tag)
        }
      }
      setSelectedTransactionIds([])
      closeBulkEdit()
      toast.success(
        `${count} transacción${count === 1 ? '' : 'es'} actualizada${count === 1 ? '' : 's'}`
      )
    } finally {
      setIsBulkOperating(false)
    }
  }

  const selectionCount = selectedTransactionIds.length
  const hasSelection = selectionCount > 0

  const allPageSelected =
    paginatedTransactionIds.length > 0 &&
    paginatedTransactionIds.every((id) =>
      selectedTransactionIds.includes(id)
    )
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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
            Transacciones
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: 14 }}>
            {filteredTransactions.length}{' '}
            movimiento{filteredTransactions.length !== 1 ? 's' : ''}
            {hasActiveFilters ? ' · filtrado' : ''} · {periodLabelText}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            style={{ gap: 6 }}
          >
            <Download size={15} />
            Exportar
          </Button>
        </div>
      </div>

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
            if (!onBulkCategorize) return
            setIsBulkOperating(true)
            void (async () => {
              try {
                await onBulkCategorize(selectedTransactionIds, category)
                setSelectedTransactionIds([])
                toast.success(
                  `${selectionCount} transacción${selectionCount === 1 ? '' : 'es'} categorizada${selectionCount === 1 ? '' : 's'}`
                )
              } finally {
                setIsBulkOperating(false)
              }
            })()
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
        onClearAll={clearAllFilters}
      />

      {/* Table */}
      <TransactionTable
        paginatedTransactions={paginatedTransactions}
        selectedTransactionIds={selectedTransactionIds}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        isBusy={isBusy}
        pendingTransactionId={pendingTransactionId}
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
        onClearFilters={clearAllFilters}
        onShowIgnoredChange={setShowIgnored}
        onEdit={startEditTransaction}
        onDelete={(transaction) => {
          void handleDeleteTransaction(transaction)
        }}
      />

      <EditTransactionDialog
        editingTransaction={editingTransaction}
        editDescription={editDescription}
        editCategory={editCategory}
        editTagList={editTagList}
        applyScope={applyScope}
        editError={editError}
        categoryPickerOpen={categoryPickerOpen}
        tagPickerOpen={tagPickerOpen}
        newCategoryInput={newCategoryInput}
        newTagInput={newTagInput}
        filteredCategorySuggestions={filteredCategorySuggestions}
        filteredTagSuggestions={filteredTagSuggestions}
        pendingTransactionId={pendingTransactionId}
        onDescriptionChange={setEditDescription}
        onCategoryChange={setEditCategory}
        onApplyScopeChange={setApplyScope}
        onCategoryPickerOpenChange={setCategoryPickerOpen}
        onTagPickerOpenChange={setTagPickerOpen}
        onNewCategoryInputChange={setNewCategoryInput}
        onNewTagInputChange={setNewTagInput}
        onAddCategory={handleAddCategory}
        onAddTag={handleAddTag}
        onAddInlineTag={handleAddInlineTag}
        onRemoveTag={handleRemoveTag}
        onSave={() => {
          void handleSaveEditTransaction()
        }}
        onCancel={resetEditState}
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
        bulkFilteredCategories={bulkFilteredCategories}
        bulkFilteredTags={bulkFilteredTags}
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
            : `Mostrando ${startIndex + 1}-${startIndex + paginatedTransactions.length} de ${filteredTransactions.length}`}
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
    </div>
  )
}
