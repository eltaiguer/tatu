import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from './ui/card'
import type { Currency, TransactionsFilter } from '../models'
import type {
  CategoryChange,
  CategoryChanges,
} from '../services/charts/category-changes'
import { getCategoryDisplay } from '../utils/category-display'
import { getCategoryDefinition } from '../services/categories/category-registry'
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
      <Card className="gap-1 p-5">
        <h2 className="text-[15px] font-semibold">Qué cambió</h2>
        <p className="text-[13px] text-muted-foreground">
          Todavía no hay suficientes meses completos para comparar: hace falta
          un mes cerrado y al menos dos anteriores con todas tus cuentas
          importadas.
        </p>
      </Card>
    )
  }

  const { reference, baseline, increases, decrease } = changes
  const baselineLabel = `${monthName(baseline[0], 'short')}–${monthName(
    baseline[baseline.length - 1],
    'short'
  )}`

  function Row({ change, down }: { change: CategoryChange; down?: boolean }) {
    const display = getCategoryDisplay(change.category)
    const icon = getCategoryDefinition(display.id).icon
    const open = (filter: TransactionsFilter) => () => onOpen?.(filter)
    const base = {
      categories: [change.category],
      type: 'debit' as const,
    }
    return (
      <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_auto_auto]">
        <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium">
          <span aria-hidden>{icon}</span>
          <span className="truncate">
            {down ? `Bajaste en ${display.label}` : display.label}
          </span>
        </span>
        <span className="flex items-center gap-1 justify-self-end font-mono text-[13px]">
          {down ? (
            <ArrowDownRight size={14} className="text-[color:var(--pos)]" />
          ) : (
            <ArrowUpRight size={14} className="text-[color:var(--neg)]" />
          )}
          {signed(change.delta, homeCurrency)}
          {change.pct !== null && (
            <span className="text-muted-foreground">
              ({change.pct >= 0 ? '+' : ''}
              {Math.round(change.pct * 100)}%)
            </span>
          )}
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-x-3 text-[12px] text-muted-foreground sm:col-span-1 sm:justify-self-end">
          <button
            type="button"
            disabled={!onOpen}
            onClick={open({ ...base, period: monthPeriod(reference) })}
            className="font-mono text-[12px] text-[color:var(--text)] underline-offset-2 hover:underline disabled:no-underline"
            aria-label={`Ver los gastos en ${display.label} de ${monthName(reference)}`}
          >
            {formatCurrency(change.current, homeCurrency)} en{' '}
            {monthName(reference, 'short')}
          </button>
          <button
            type="button"
            disabled={!onOpen}
            onClick={open({ ...base, period: rangePeriod(baseline) })}
            className="font-mono text-[11.5px] underline-offset-2 hover:underline disabled:no-underline"
            aria-label={`Ver los gastos en ${display.label} de ${baselineLabel}`}
            title={`Mediana de ${baselineLabel}: ${formatCurrency(change.median, homeCurrency)}`}
          >
            {baseline
              .map(
                (m, i) =>
                  `${monthName(m, 'short')} ${formatCurrency(
                    change.baselineByMonth[i],
                    homeCurrency
                  )}`
              )
              .join(' · ')}
          </button>
        </span>
      </li>
    )
  }

  return (
    <Card className="gap-2 p-5">
      <div>
        <h2 className="text-[15px] font-semibold">
          Qué cambió en {monthName(reference)}
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Contra la mediana de {baselineLabel} · solo meses completos de todas
          tus cuentas
        </p>
      </div>
      {increases.length === 0 && !decrease ? (
        <p className="text-[13px] text-muted-foreground">
          Ninguna categoría cambió más de lo habitual.
        </p>
      ) : (
        <ul>
          {increases.map((change) => (
            <Row key={change.category} change={change} />
          ))}
          {decrease && <Row change={decrease} down />}
        </ul>
      )}
    </Card>
  )
}
