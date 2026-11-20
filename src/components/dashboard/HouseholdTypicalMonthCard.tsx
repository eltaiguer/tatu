// Un mes típico del hogar — Hogar mode's card in the savings card's slot: the
// median household month over the complete months of "Mes a mes", its band
// and the top categories by their own median. No drill: the months are not
// contiguous, and the categories do not add up to the median.

import type { Currency } from '../../models'
import { resolveCategory } from '../../services/categories/category-registry'
import type { MonthlyTrendRow } from '../../services/charts/dashboard-rows'
import type { TypicalMonth } from '../../services/charts/typical-month'
import { formatCurrency } from '../../utils/formatting'
import { Card } from '../ui/card'
import { PartialMonthsNote } from './PartialMonthsNote'

interface HouseholdTypicalMonthCardProps {
  typical: TypicalMonth | null
  monthlyTrend: MonthlyTrendRow[]
  homeCurrency: Currency
}

export function HouseholdTypicalMonthCard({
  typical,
  monthlyTrend,
  homeCurrency,
}: HouseholdTypicalMonthCardProps) {
  // Equal to the cent is equal: converted months can differ by float noise.
  const showBand =
    typical !== null &&
    Math.round(typical.min * 100) !== Math.round(typical.max * 100)
  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[258px_1fr] gap-8 items-center">
        <div>
          <h3 className="m-0 mb-[10px] text-title font-semibold">
            Un mes típico del hogar
          </h3>
          {typical === null ? (
            <p className="mt-[4px] text-[14px] leading-[1.5]">
              Todavía no tenés ningún mes importado entero en todas tus cuentas,
              así que no hay un mes típico para comparar.
            </p>
          ) : (
            <>
              <div className="text-[12px] font-medium text-muted-foreground">
                {typical.months.length === 1
                  ? 'Mediana de 1 mes completo'
                  : `Mediana de ${typical.months.length} meses completos`}
              </div>
              {/* Spend, not a verdict: no --pos / --neg. */}
              <div className="font-mono tabular-nums mt-[4px] text-[30px] font-semibold">
                {formatCurrency(typical.median, homeCurrency)}
              </div>
              {showBand && (
                <p className="mt-[8px] mb-0 text-[14px] leading-[1.5]">
                  Entre{' '}
                  <span className="font-mono tabular-nums">
                    {formatCurrency(typical.min, homeCurrency)}
                  </span>{' '}
                  y{' '}
                  <span className="font-mono tabular-nums">
                    {formatCurrency(typical.max, homeCurrency)}
                  </span>{' '}
                  por mes
                </p>
              )}
              <PartialMonthsNote monthlyTrend={monthlyTrend} />
            </>
          )}
        </div>

        {typical !== null && typical.topCategories.length > 0 && (
          <div>
            <div className="mb-[8px] text-[12px] font-medium text-muted-foreground">
              Por categoría, en un mes típico
            </div>
            <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
              {typical.topCategories.map((c) => {
                const display = resolveCategory(c.category)
                return (
                  <li
                    key={c.category}
                    className="flex items-center justify-between gap-3 text-[14px]"
                  >
                    <span>
                      <span aria-hidden="true">{display.icon}</span>{' '}
                      {display.label}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(c.median, homeCurrency)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
