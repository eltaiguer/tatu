import type { FilterPatch } from '../../services/filters/transaction-filter'
import type { UrlFilterState } from '../../services/filters/url-filters'

export const ACCOUNT_OPTIONS: {
  value: UrlFilterState['accounts'][number]
  label: string
}[] = [
  { value: 'credit_card', label: 'Tarjeta' },
  { value: 'bank_account', label: 'Cuenta bancaria' },
]

// The filters behind "Filtros": everything the bar's primary row does not
// show (search, Categoría, Hogar, A revisar and the period live elsewhere).
// What the panel's "Limpiar" applies.
export const SECONDARY_FILTERS_CLEARED: FilterPatch = {
  accounts: [],
  type: 'all',
  currency: 'all',
  min: '',
  max: '',
  showIgnored: false,
}

// One removable chip per active secondary filter, in the order the panel
// lists them. Its length is the N of "Filtros (N)".
export function secondaryFilterChips(
  filters: UrlFilterState
): { label: string; clear: FilterPatch }[] {
  const { accounts, type, currency, min, max, showIgnored } = filters
  const chips: { label: string; clear: FilterPatch }[] = []
  accounts.forEach((a) => {
    const label = ACCOUNT_OPTIONS.find((o) => o.value === a)?.label ?? a
    chips.push({
      label: `Cuenta: ${label}`,
      clear: { accounts: accounts.filter((x) => x !== a) },
    })
  })
  if (type !== 'all') {
    chips.push({
      label: `Tipo: ${type === 'credit' ? 'Ingresos' : 'Gastos'}`,
      clear: { type: 'all' },
    })
  }
  if (currency !== 'all') {
    chips.push({
      label: `Moneda: ${currency === 'USD' ? 'US$' : '$U'}`,
      clear: { currency: 'all' },
    })
  }
  if (min || max) {
    chips.push({
      label: `Monto: ${min || '0'}–${max || '∞'}`,
      clear: { min: '', max: '' },
    })
  }
  if (showIgnored) {
    chips.push({
      label: 'Transferencias ignoradas: visibles',
      clear: { showIgnored: false },
    })
  }
  return chips
}
