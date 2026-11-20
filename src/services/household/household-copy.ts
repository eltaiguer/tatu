import type { Currency, HouseholdResolution } from '../../models'
import { formatCurrency } from '../../utils/formatting'
import { resolveCategory } from '../categories/category-registry'

// THE Spanish copy of a Hogar answer, so every surface says it the same way
// (CONTEXT.md, "Hogar"). Never hand-build these strings in a component.

/** A value in compact form: "Hogar: Sí" / "Hogar: No". */
export function householdValueLabel(isHousehold: boolean): string {
  return isHousehold ? 'Hogar: Sí' : 'Hogar: No'
}

/**
 * A row's status line: "Hogar · según Alimentación",
 * "No es del hogar · elegido a mano", "Hogar · según comercio".
 */
export function householdLine(
  category: string | undefined,
  view: HouseholdResolution
): string {
  const value = view.status === 'household' ? 'Hogar' : 'No es del hogar'
  const source =
    view.source === 'row'
      ? 'elegido a mano'
      : view.source === 'merchant'
        ? 'según comercio'
        : `según ${resolveCategory(category).label}`
  return `${value} · ${source}`
}

/** The edit dialog's "follow" option: "Según comercio (Sí)". */
export function followOptionLabel(
  source: 'comercio' | 'categoría',
  isHousehold: boolean
): string {
  return `Según ${source} (${isHousehold ? 'Sí' : 'No'})`
}

/** The Insights card's action that saves a merchant's household rule. */
export const MARK_AS_HOUSEHOLD = 'Marcar como hogar'

/** The toast after it: "Hogar: Sí en 3 transacciones de Netflix". */
export function householdMarkedToast(merchant: string, count: number): string {
  return count === 1
    ? `${householdValueLabel(true)} en 1 transacción de ${merchant}`
    : `${householdValueLabel(true)} en ${count} transacciones de ${merchant}`
}

/**
 * The household's share of a total: "Hogar 62% de US$ 2.300,00". Never claims
 * 0% / 100% of a total it is not exactly none / all of; null with no total.
 */
export function householdShareLine(
  part: number,
  total: number,
  currency: Currency
): string | null {
  if (!(total > 0)) return null
  let share: string
  if (part <= 0) share = '0%'
  else if (part >= total) share = '100%'
  else {
    const pct = Math.round((part / total) * 100)
    share = pct < 1 ? '<1%' : `${Math.min(pct, 99)}%`
  }
  return `Hogar ${share} de ${formatCurrency(total, currency)}`
}
