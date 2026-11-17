import { House } from 'lucide-react'
import type { Transaction } from '../../models'
import { householdLine } from '../../services/household/household-copy'
import { rowHouseholdView } from '../../services/household/household'
import { useHouseholdRules } from '../../hooks/useHouseholdRules'

// The row's Hogar control, next to the category badge. The house shows the
// value only: filled in the brand colour = Hogar, outline in the muted text
// colour = No, whatever the source. The source is said in words, in the
// name and tooltip. Renders nothing for rows that are not counted expenses.
// The state comes from the saved row (screen mirrors database), so a click
// only asks; the house moves once the write is confirmed.
export function HouseToggle({
  transaction,
  description,
  disabled,
  size = 14,
  onToggle,
}: {
  transaction: Transaction
  description: string
  disabled: boolean
  size?: number
  onToggle: (transaction: Transaction) => void
}) {
  // Read while rendering: a category default changed in Categorías applies
  // to the rows without a reload.
  const view = rowHouseholdView(transaction, useHouseholdRules())
  if (!view) return null

  const household = view.status === 'household'
  const line = householdLine(transaction.category, view)

  // The name carries value and source; aria-pressed says it is a toggle.
  return (
    <button
      type="button"
      aria-label={`${description}: ${line}`}
      aria-pressed={household}
      title={line}
      disabled={disabled}
      onClick={() => onToggle(transaction)}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--brand-text)] disabled:opacity-50 ${
        household
          ? 'text-[color:var(--brand-text)]'
          : 'text-[color:var(--text-muted)]'
      }`}
    >
      <House
        size={size}
        aria-hidden="true"
        fill={household ? 'currentColor' : 'none'}
      />
    </button>
  )
}
