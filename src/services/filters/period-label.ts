import type { UrlPeriod } from './url-filters'

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

// Transaction dates are calendar days at UTC midnight (#58): months and the
// newest row are read in UTC, the same calendar months Resumen sums — so a
// drill-through holds exactly the rows of the number clicked. The period's
// day bounds live with the filter (periodDateRange in transaction-filter).
export function getPeriodLabel(period: UrlPeriod): string {
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

// A 'YYYY-MM' month named mid-sentence: "nov. 2025" (lowercase, CONTEXT.md).
export function shortMonthLabel(key: string): string {
  return new Intl.DateTimeFormat('es-UY', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${key}-01T00:00:00.000Z`))
    .toLowerCase()
}

// A file's span, "mar. 2025 – dic. 2025" (en dash); one month → "nov. 2025".
export function monthSpanLabel(from: string, to: string): string {
  const start = shortMonthLabel(from.slice(0, 7))
  const end = shortMonthLabel(to.slice(0, 7))
  return start === end ? start : `${start} – ${end}`
}
