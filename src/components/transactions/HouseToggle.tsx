import { House } from 'lucide-react'
import type { Transaction } from '../../models'
import { resolveCategory } from '../../services/categories/category-registry'
import {
  currentCategoryHousehold,
  rowHouseholdView,
} from '../../services/household/household'

// The row's "gasto del hogar" control, next to the category badge. Faint when
// the row follows its category, solid brand colour when it was set by hand;
// filled = household, outline = not, dashed = Sin definir. Renders nothing
// for rows that are not counted expenses. The state comes from the saved row
// (screen mirrors database), so a click only asks; the house moves once the
// write is confirmed.
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
  const view = rowHouseholdView(transaction, currentCategoryHousehold())
  if (!view) return null

  const household = view.status === 'household'
  const unassigned = view.status === 'unassigned'
  const title = unassigned
    ? 'Sin definir: categorizala o marcala'
    : `${household ? 'Hogar' : 'No es del hogar'} · ${
        view.isOverride
          ? 'elegido a mano'
          : `según ${resolveCategory(transaction.category).label}`
      }`

  return (
    <button
      type="button"
      aria-label={`Gasto del hogar: ${description}`}
      aria-pressed={household}
      title={title}
      disabled={disabled}
      onClick={() => onToggle(transaction)}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--brand-text)] disabled:opacity-50 ${
        view.isOverride
          ? 'text-[color:var(--brand-text)]'
          : household
            ? // A filled house that follows its category is stronger than the
              // faint outline, so the two read apart at 14px.
              'text-[color:var(--text-muted)]'
            : 'text-[color:var(--text-faint)]'
      }`}
    >
      <House
        size={size}
        aria-hidden="true"
        fill={household ? 'currentColor' : 'none'}
        // Round caps would close the gaps of a dashed line at this size.
        strokeDasharray={unassigned ? '3 3' : undefined}
        strokeLinecap={unassigned ? 'butt' : undefined}
      />
    </button>
  )
}
