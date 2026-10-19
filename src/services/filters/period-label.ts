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
