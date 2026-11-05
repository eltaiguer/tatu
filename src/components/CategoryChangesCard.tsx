import { useId } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from './ui/card'
import type { Currency, TransactionsFilter } from '../models'
import type {
  CategoryChange,
  CategoryChanges,
} from '../services/charts/category-changes'
import { resolveCategory } from '../services/categories/category-registry'
import { formatCurrency } from '../utils/formatting'

function monthName(key: string, style: 'long' | 'short' = 'long'): string {
  // es-UY capitalizes long month names; they sit mid-sentence here.
  return new Intl.DateTimeFormat('es-UY', {
    month: style,
    timeZone: 'UTC',
  })
    .format(new Date(`${key}-01T00:00:00.000Z`))
    .toLowerCase()
}

function monthPeriod(key: string) {
  const [y, m] = key.split('-').map(Number)
  return { mode: 'month' as const, y, m: m - 1 }
}

function rangePeriod(months: string[]) {
  const first = months[0]
  const last = months[months.length - 1]
  const [ly, lm] = last.split('-').map(Number)
  const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate()
  return {
    mode: 'range' as const,
    from: `${first}-01`,
    to: `${last}-${String(lastDay).padStart(2, '0')}`,
  }
}

function signed(amount: number, currency: Currency): string {
  return `${amount >= 0 ? '+' : '−'}${formatCurrency(Math.abs(amount), currency)}`
}

function signedPct(pct: number): string {
  return `(${pct >= 0 ? '+' : '−'}${Math.round(Math.abs(pct) * 100)}%)`
}

// Every row shares the list's column tracks (subgrid), so the deltas and
// amounts line up: name | delta | the month over its baseline once the card
// is wide enough; narrower, the two links wrap under the name and delta.
function ChangeRow({
  change,
  down,
  reference,
  baseline,
  baselineLabel,
  homeCurrency,
  onOpen,
}: {
  change: CategoryChange
  down?: boolean
  reference: string
  baseline: string[]
  baselineLabel: string
  homeCurrency: Currency
  onOpen?: (filter: TransactionsFilter) => void
}) {
  const display = resolveCategory(change.category)
  const byMonthId = useId()
  const open = (filter: TransactionsFilter) => () => onOpen?.(filter)
  const base = {
    categories: [change.category],
    type: 'debit' as const,
  }
  const byMonth = baseline
    .map(
      (m, i) =>
        `${monthName(m, 'short')} ${formatCurrency(
          change.baselineByMonth[i],
          homeCurrency
        )}`
    )
    .join(' · ')
  const Arrow = down ? ArrowDownRight : ArrowUpRight
  return (
    <li className="col-span-full grid grid-cols-subgrid items-center gap-y-1 border-b border-border py-2.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-body font-medium">
        <span aria-hidden>{display.icon}</span>
        <span className="truncate">{display.label}</span>
      </span>
      <span className="flex items-center justify-self-end gap-1.5">
        <Arrow
          aria-hidden
          size={14}
          className={
            down ? 'text-[color:var(--pos)]' : 'text-[color:var(--neg)]'
          }
        />
        <span className="sr-only">{down ? 'Bajó' : 'Subió'}</span>
        <span className="font-mono text-body font-semibold tabular-nums">
          {signed(change.delta, homeCurrency)}
        </span>
        {/* A fixed slot, empty without a %, keeps the deltas' right edge. */}
        <span className="w-[8ch] text-right font-mono text-label tabular-nums text-muted-foreground">
          {change.pct !== null && signedPct(change.pct)}
        </span>
      </span>
      <span className="col-span-full flex flex-wrap items-baseline gap-x-3 @xl:col-span-1 @xl:flex-col @xl:items-end @xl:gap-0">
        <button
          type="button"
          disabled={!onOpen}
          onClick={open({ ...base, period: monthPeriod(reference) })}
          className="text-label text-[color:var(--text)] underline-offset-2 hover:underline disabled:no-underline"
          aria-label={`Ver los gastos en ${display.label} de ${monthName(reference)}`}
        >
          <span className="font-mono tabular-nums">
            {formatCurrency(change.current, homeCurrency)}
          </span>{' '}
          en {monthName(reference, 'short')}
        </button>
        <button
          type="button"
          disabled={!onOpen}
          onClick={open({ ...base, period: rangePeriod(baseline) })}
          className="text-caption text-muted-foreground underline-offset-2 hover:underline disabled:no-underline"
          aria-label={`Ver los gastos en ${display.label} de ${baselineLabel}`}
          aria-describedby={byMonthId}
          title={byMonth}
        >
          mediana{' '}
          <span className="font-mono tabular-nums">
            {formatCurrency(change.median, homeCurrency)}
          </span>
        </button>
        <span id={byMonthId} hidden>
          {byMonth}
        </span>
      </span>
    </li>
  )
}

// "What changed": leads Resumen with the categories that moved most in the
// latest complete month, against the median of the months before it. Each
// number links to exactly the rows behind it (the month's expenses, and the
// baseline months' expenses).
export function CategoryChangesCard({
  changes,
  homeCurrency,
  onOpen,
}: {
  changes: CategoryChanges
  homeCurrency: Currency
  onOpen?: (filter: TransactionsFilter) => void
}) {
  if (changes.kind === 'insufficient') {
    return (
      // Nothing to compare yet: a quiet note, so the month below leads.
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-[var(--radius-md)] bg-[var(--surface-2)] px-4 py-2.5">
        <h2 className="text-small font-semibold">Qué cambió</h2>
        <p className="text-small text-muted-foreground">
          Todavía no hay suficientes meses completos para comparar: hace falta
          un mes cerrado y al menos dos anteriores con todas tus cuentas
          importadas.
        </p>
      </div>
    )
  }

  const { reference, baseline, increases, decrease } = changes
  const baselineLabel = `${monthName(baseline[0], 'short')}–${monthName(
    baseline[baseline.length - 1],
    'short'
  )}`

  return (
    <Card className="@container gap-2 p-5">
      <div>
        <h2 className="text-ui font-semibold">
          Qué cambió en {monthName(reference)}
        </h2>
        <p className="text-label text-muted-foreground">
          Contra la mediana de {baselineLabel} · solo meses completos de todas
          tus cuentas
        </p>
      </div>
      {increases.length === 0 && !decrease ? (
        <p className="text-small text-muted-foreground">
          Ninguna categoría cambió más de lo habitual.
        </p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 @xl:grid-cols-[minmax(0,1fr)_auto_auto] @xl:gap-x-6">
          {increases.map((change) => (
            <ChangeRow
              key={change.category}
              change={change}
              reference={reference}
              baseline={baseline}
              baselineLabel={baselineLabel}
              homeCurrency={homeCurrency}
              onOpen={onOpen}
            />
          ))}
          {decrease && (
            <ChangeRow
              change={decrease}
              down
              reference={reference}
              baseline={baseline}
              baselineLabel={baselineLabel}
              homeCurrency={homeCurrency}
              onOpen={onOpen}
            />
          )}
        </ul>
      )}
    </Card>
  )
}
