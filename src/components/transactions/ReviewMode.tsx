import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ListChecks } from 'lucide-react'
import type { Currency, Transaction } from '../../models'
import { resolveCategory } from '../../services/categories/category-registry'
import { transactionLabel } from '../../services/merchants/merchant-key'
import {
  buildReviewQueue,
  reviewSuggestion,
  toHome,
} from '../../services/review/review-queue'
import { ACCOUNT_LABELS, accountOf } from '../../utils/account-display'
import { formatCurrency, formatDate } from '../../utils/formatting'
import { needsCategoryReview } from '../../utils/transaction-display'
import { CategoryPicker } from '../CategoryPicker'
import { Button } from '../ui/button'
import { PageHeader } from '../ui/page-header'
import { isPlainShortcut } from './category-shortcut'
import type { useCategoryWrites } from './useCategoryWrites'

type ReviewWrites = Pick<ReturnType<typeof useCategoryWrites>, 'pickForReview'>
type PickResult = NonNullable<
  Awaited<ReturnType<ReviewWrites['pickForReview']>>
>

export interface ReviewModeProps {
  // The A revisar rows the view lists: the queue is taken from them once.
  rows: Transaction[]
  // All of the user's rows, live: a row is looked up here by id.
  transactions: Transaction[]
  homeCurrency: string
  fxRate: number
  writes: ReviewWrites
  // Rows with a write in flight (a toast's Reintentar counts).
  pending: ReadonlySet<string>
  onLeave: () => void
  onGoToOverview?: () => void
}

/** The table's way into the mode (over the A revisar rows). */
export function ReviewModeButton({
  onClick,
  autoFocus,
}: {
  onClick: () => void
  autoFocus?: boolean
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      autoFocus={autoFocus}
      className="mt-2 gap-[6px]"
    >
      <ListChecks size={15} aria-hidden />
      Revisar uno por uno
    </Button>
  )
}

interface LastPick extends PickResult {
  row: Transaction
  category: string
}

/**
 * The review mode (#280): the A revisar rows one at a time, biggest first,
 * with the category picker open. The queue is a snapshot taken on mount; a row
 * is done when the live store says it needs no review (or it is skipped), so
 * the mode never keeps its own idea of what was written.
 */
export function ReviewMode({
  rows,
  transactions,
  homeCurrency,
  fxRate,
  writes,
  pending,
  onLeave,
  onGoToOverview,
}: ReviewModeProps) {
  const home = homeCurrency as Currency
  const [queue] = useState(() => buildReviewQueue(rows, home, fxRate))
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set())
  const [working, setWorking] = useState(false)
  const [lastPick, setLastPick] = useState<LastPick | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const workingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const byId = useMemo(
    () => new Map(transactions.map((tx) => [tx.id, tx])),
    [transactions]
  )
  const isResolved = (id: string) => {
    const live = byId.get(id)
    return !live || !needsCategoryReview(live) || skipped.has(id)
  }
  const handled = queue.filter(isResolved).length
  const currentId = queue.find((id) => !isResolved(id))
  const current = currentId ? byId.get(currentId) : undefined
  const busy = working || (currentId !== undefined && pending.has(currentId))

  const suggested = useMemo(
    () => (current ? reviewSuggestion(current, transactions) : null),
    [current, transactions]
  )

  function focusPicker() {
    const root = rootRef.current
    if (!root) return
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    const target =
      root.querySelector<HTMLElement>('[data-suggested]') ??
      (coarse
        ? root.querySelector<HTMLElement>('[data-category-option]')
        : root.querySelector<HTMLElement>(
            'input[aria-label="Buscar categoría"]'
          ))
    target?.focus()
  }

  // Every row (and every strip that closes) starts with the picker focused:
  // the option that was focused is gone. Done: the heading.
  useEffect(() => {
    if (currentId) focusPicker()
    else titleRef.current?.focus()
  }, [currentId, focusTick])

  function skip() {
    if (!currentId || busy) return
    setLastPick(null)
    setSkipped((previous) => new Set(previous).add(currentId))
  }

  async function pick(category: string) {
    if (!current || busy || workingRef.current) return
    workingRef.current = true
    setWorking(true)
    setLastPick(null)
    try {
      const result = await writes.pickForReview(current, category)
      if (result) setLastPick({ ...result, row: current, category })
    } finally {
      workingRef.current = false
      setWorking(false)
    }
  }

  async function runOffer(action: () => Promise<unknown>) {
    workingRef.current = true
    setWorking(true)
    try {
      return await action()
    } finally {
      workingRef.current = false
      setWorking(false)
    }
  }

  async function applyToSimilar() {
    const apply = lastPick?.apply
    if (!apply) return
    // Its Deshacer would be stale once the rule is written.
    setLastPick(null)
    await runOffer(apply)
    setFocusTick((tick) => tick + 1)
  }

  async function undoLast() {
    const undo = lastPick?.undo
    if (!undo) return
    if (await runOffer(undo)) setLastPick(null)
  }

  // s and Escape work from the review or from the page body (focus drops
  // there when the focused option unmounts), never from the sidebar, a
  // dialog or a toast.
  const keys = useRef({ skip, onLeave })
  keys.current = { skip, onLeave }
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.repeat) return
      const target = e.target
      const inScope =
        target === document.body ||
        (target instanceof Node && !!rootRef.current?.contains(target))
      if (!inScope) return
      if (e.key === 'Escape') {
        e.preventDefault()
        keys.current.onLeave()
      } else if (isPlainShortcut(e, 's')) {
        e.preventDefault()
        keys.current.skip()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const skippedLeft = queue.filter((id) => {
    const live = byId.get(id)
    return !!live && skipped.has(id) && needsCategoryReview(live)
  }).length
  // Money that now has a category: the queue's rows, full precision.
  const categorized = queue.reduce((sum, id) => {
    const live = byId.get(id)
    return live && !needsCategoryReview(live)
      ? sum + toHome(live, home, fxRate)
      : sum
  }, 0)

  return (
    <div
      ref={rootRef}
      className="space-y-4"
      onKeyDownCapture={(e) => {
        // Focus lands on the next row's suggestion: a held Enter must not
        // chain-pick rows.
        if (e.key === 'Enter' && e.repeat) e.preventDefault()
      }}
    >
      <PageHeader
        title="Revisar movimientos"
        subtitle="Uno por uno, el más grande primero"
        actions={
          <Button variant="outline" size="sm" onClick={onLeave}>
            Salir
          </Button>
        }
      />
      <section
        aria-labelledby="review-title"
        className="mx-auto max-w-xl space-y-4 rounded-lg border bg-card p-4 md:p-6"
      >
        {current ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p
                  aria-live="polite"
                  className="text-sm text-muted-foreground tabular-nums"
                >
                  {`${handled + 1} de ${queue.length}`}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skip}
                  aria-keyshortcuts="s"
                >
                  Saltar
                </Button>
              </div>
              <div
                aria-hidden
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(handled / queue.length) * 100}%` }}
                />
              </div>
            </div>
            {lastPick && (
              <div
                role="status"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <Check size={14} aria-hidden />
                  {resolveCategory(lastPick.category).label} en{' '}
                  {transactionLabel(lastPick.row)}
                </span>
                {lastPick.apply && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => void applyToSimilar()}
                  >
                    {lastPick.others === 1
                      ? 'Aplicar a la otra similar'
                      : `Aplicar a las ${lastPick.others} similares`}
                  </Button>
                )}
                {lastPick.undo && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => void undoLast()}
                  >
                    Deshacer
                  </Button>
                )}
              </div>
            )}
            <CurrentRow row={current} home={home} fxRate={fxRate} />
            <div
              aria-busy={busy}
              aria-disabled={busy}
              className={busy ? 'opacity-60' : undefined}
            >
              <CategoryPicker
                key={current.id}
                suggested={suggested}
                touch={!!window.matchMedia?.('(pointer: coarse)').matches}
                onPick={(category) => void pick(category)}
              />
            </div>
            <p className="hidden text-xs text-muted-foreground md:block">
              Enter elige · S salta · Esc sale
            </p>
          </>
        ) : (
          <Done
            titleRef={titleRef}
            empty={queue.length === 0}
            skipped={skippedLeft}
            categorized={categorized}
            home={home}
            onReviewSkipped={() => setSkipped(new Set())}
            onGoToOverview={onGoToOverview}
            onLeave={onLeave}
          />
        )}
      </section>
    </div>
  )
}

function CurrentRow({
  row,
  home,
  fxRate,
}: {
  row: Transaction
  home: Currency
  fxRate: number
}) {
  const label = transactionLabel(row)
  const currency = row.currency as Currency
  return (
    <div className="space-y-1">
      <h2
        id="review-title"
        className="font-display text-xl font-semibold break-words"
      >
        {label}
      </h2>
      {label !== row.description && (
        <p className="text-xs text-muted-foreground break-words">
          Original: {row.description}
        </p>
      )}
      <p className="font-mono text-2xl tabular-nums">
        {row.type === 'credit' ? '+' : '-'}
        {formatCurrency(row.amount, currency)}
      </p>
      {currency !== home && (
        <p className="font-mono text-sm text-muted-foreground tabular-nums">
          ≈ {formatCurrency(toHome(row, home, fxRate), home)}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {ACCOUNT_LABELS[accountOf(row.source, row.currency)]} ·{' '}
        {formatDate(row.date)}
      </p>
    </div>
  )
}

function Done({
  titleRef,
  empty,
  skipped,
  categorized,
  home,
  onReviewSkipped,
  onGoToOverview,
  onLeave,
}: {
  titleRef: React.RefObject<HTMLHeadingElement>
  empty: boolean
  skipped: number
  categorized: number
  home: Currency
  onReviewSkipped: () => void
  onGoToOverview?: () => void
  onLeave: () => void
}) {
  const title = empty
    ? 'Nada para revisar'
    : skipped > 0
      ? 'Revisión terminada'
      : 'Todo categorizado'
  return (
    <div className="space-y-3">
      <h2
        id="review-title"
        ref={titleRef}
        tabIndex={-1}
        className="font-display text-xl font-semibold outline-none"
      >
        {title}
      </h2>
      {empty && (
        <p className="text-sm text-muted-foreground">
          No quedan movimientos sin categoría ni con poca seguridad en esta
          lista.
        </p>
      )}
      {skipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {skipped === 1
            ? 'Saltaste 1 · sigue en la lista'
            : `Saltaste ${skipped} · siguen en la lista`}
        </p>
      )}
      {!empty && categorized > 0 && (
        <p className="font-mono text-sm tabular-nums">
          {formatCurrency(categorized, home)} ahora tiene categoría
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {skipped > 0 && (
          <Button size="sm" onClick={onReviewSkipped}>
            Revisar las salteadas
          </Button>
        )}
        {onGoToOverview && (
          <Button variant="outline" size="sm" onClick={onGoToOverview}>
            Ver Resumen
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onLeave}>
          Volver a la lista
        </Button>
      </div>
    </div>
  )
}
