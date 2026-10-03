import type { TransactionsFilter } from '../../models'

// The Transacciones filter state as it lives in the URL, so a filtered view
// survives a refresh, works with back/forward, and can be linked to
// ("Restaurantes en marzo" = ?categoria=restaurants&periodo=2026-03).

export type UrlPeriod =
  | { mode: 'month'; y: number; m: number } // m is 0-based
  | { mode: 'recent'; n: number }
  | { mode: 'all' }
  | { mode: 'range'; from: string; to: string }

export interface UrlFilterState {
  search: string
  categories: string[]
  accounts: Array<'credit_card' | 'bank_account'>
  currency: 'all' | 'USD' | 'UYU'
  type: 'all' | 'credit' | 'debit'
  min: string
  max: string
  showIgnored: boolean
  // Undefined when the URL doesn't say; the view picks its default.
  period?: UrlPeriod
}

export const DEFAULT_URL_FILTERS: UrlFilterState = {
  search: '',
  categories: [],
  accounts: [],
  currency: 'all',
  type: 'all',
  min: '',
  max: '',
  showIgnored: false,
}

const ACCOUNTS = ['credit_card', 'bank_account'] as const
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function isNumeric(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value))
}

function parsePeriod(params: URLSearchParams): UrlPeriod | undefined {
  const periodo = params.get('periodo')
  if (periodo === 'todo') return { mode: 'all' }
  const month = periodo?.match(/^(\d{4})-(\d{2})$/)
  if (month) {
    const m = Number(month[2]) - 1
    if (m >= 0 && m <= 11) return { mode: 'month', y: Number(month[1]), m }
  }
  const recent = periodo?.match(/^ultimos-(\d{1,2})$/)
  if (recent && Number(recent[1]) > 0) {
    return { mode: 'recent', n: Number(recent[1]) }
  }
  const from = params.get('desde') ?? ''
  const to = params.get('hasta') ?? ''
  if ((ISO_DAY.test(from) || ISO_DAY.test(to)) && !periodo) {
    return {
      mode: 'range',
      from: ISO_DAY.test(from) ? from : '',
      to: ISO_DAY.test(to) ? to : '',
    }
  }
  return undefined
}

// Unknown enum values and malformed numbers/periods are dropped rather than
// failing. Category ids are kept as-is: custom categories load after the URL
// is first read, so validating them here would lose them on a cold refresh.
export function parseFilterParams(search: string): UrlFilterState {
  const params = new URLSearchParams(search)
  const currency = params.get('moneda')
  const type = params.get('tipo')
  const min = params.get('min') ?? ''
  const max = params.get('max') ?? ''
  return {
    search: params.get('q') ?? '',
    categories: params.getAll('categoria').filter(Boolean),
    accounts: params
      .getAll('cuenta')
      .filter((a): a is (typeof ACCOUNTS)[number] =>
        (ACCOUNTS as readonly string[]).includes(a)
      ),
    currency: currency === 'USD' || currency === 'UYU' ? currency : 'all',
    type: type === 'credit' || type === 'debit' ? type : 'all',
    min: isNumeric(min) ? min : '',
    max: isNumeric(max) ? max : '',
    showIgnored: params.get('ignoradas') === '1',
    ...(parsePeriod(params) && { period: parsePeriod(params) }),
  }
}

// Defaults are omitted so an unfiltered view has a clean URL.
export function serializeFilterParams(state: UrlFilterState): string {
  const params = new URLSearchParams()
  if (state.search) params.set('q', state.search)
  state.categories.forEach((c) => params.append('categoria', c))
  state.accounts.forEach((a) => params.append('cuenta', a))
  if (state.currency !== 'all') params.set('moneda', state.currency)
  if (state.type !== 'all') params.set('tipo', state.type)
  if (state.min) params.set('min', state.min)
  if (state.max) params.set('max', state.max)
  if (state.showIgnored) params.set('ignoradas', '1')
  const period = state.period
  if (period?.mode === 'all') params.set('periodo', 'todo')
  if (period?.mode === 'month') {
    params.set(
      'periodo',
      `${period.y}-${String(period.m + 1).padStart(2, '0')}`
    )
  }
  if (period?.mode === 'recent') params.set('periodo', `ultimos-${period.n}`)
  if (period?.mode === 'range') {
    if (period.from) params.set('desde', period.from)
    if (period.to) params.set('hasta', period.to)
  }
  return params.toString()
}

// Deep link from another view. A filtered link with no period means all
// time — the same default the view used for deep links before URLs existed.
export function filterToSearch(
  filter: TransactionsFilter & { period?: UrlPeriod }
): string {
  const state: UrlFilterState = {
    ...DEFAULT_URL_FILTERS,
    categories: filter.category ? [filter.category] : [],
    accounts:
      filter.accountType && filter.accountType !== 'all'
        ? [filter.accountType]
        : [],
    currency: filter.currency ?? 'all',
  }
  const filtered =
    state.categories.length > 0 ||
    state.accounts.length > 0 ||
    state.currency !== 'all'
  const period =
    filter.period ?? (filtered ? { mode: 'all' as const } : undefined)
  return serializeFilterParams({ ...state, ...(period && { period }) })
}
