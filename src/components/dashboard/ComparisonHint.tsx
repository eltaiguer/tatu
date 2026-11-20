import {
  MIN_COMPLETE_MONTHS,
  type AccountGap,
} from '../../services/charts/category-changes'
import { shortMonthLabel } from '../../services/filters/period-label'
import { ACCOUNT_LABELS } from '../../utils/account-display'

// "A", "A y B", "A, B y C" (Intl.ListFormat isn't typed in our TS lib).
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// Under the month hero when "Qué cambió" has nothing to compare: how far the
// complete months are from enough, and, when an account (not time) is what
// is missing, which one and a way to import it. Returns two quiet lines for
// the hero's `notes` slot.
export function ComparisonHint({
  completeInARow,
  gap,
  onImport,
}: {
  completeInARow: number
  gap?: AccountGap
  onImport?: () => void
}) {
  return (
    <>
      <p className="text-small text-muted-foreground">
        Comparaciones mes a mes: a partir de {MIN_COMPLETE_MONTHS} meses
        completos (tenés {completeInARow})
      </p>
      {gap && (
        <p className="text-small text-muted-foreground">
          <span>
            A {shortMonthLabel(gap.month)} le faltan datos de{' '}
            {joinList(gap.accounts.map((a) => ACCOUNT_LABELS[a]))}
          </span>
          {onImport && (
            <>
              {' · '}
              <button
                type="button"
                onClick={onImport}
                className="cursor-pointer rounded-sm border-none bg-transparent p-0 font-semibold text-[var(--text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Importar extracto
                <span aria-hidden="true"> →</span>
              </button>
            </>
          )}
        </p>
      )}
    </>
  )
}
