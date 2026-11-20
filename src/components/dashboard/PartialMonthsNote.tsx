import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'

// "No cuenta ago. 2026: le faltan datos de alguna cuenta." — the months a card
// leaves out of its figure. Shown only beside a figure (≥ 1 complete month)
// and when something was left out.
export function PartialMonthsNote({
  monthlyTrend,
}: {
  monthlyTrend: MonthlyTrendRow[]
}) {
  const partialMonths = monthlyTrend
    .filter((m) => !m.complete)
    .map((m) => m.month)
  if (
    partialMonths.length === 0 ||
    partialMonths.length === monthlyTrend.length
  )
    return null
  return (
    <p className="mt-[4px] mb-0 text-[12px] text-muted-foreground">
      {partialMonths.length === 1
        ? `No cuenta ${partialMonths[0]}: le faltan datos de alguna cuenta.`
        : `No cuentan ${partialMonths.slice(0, -1).join(', ')} y ${partialMonths[partialMonths.length - 1]}: les faltan datos de alguna cuenta.`}
    </p>
  )
}
