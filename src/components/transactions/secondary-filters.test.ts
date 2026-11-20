import { describe, expect, it } from 'vitest'
import {
  SECONDARY_FILTERS_CLEARED,
  householdTogglePatch,
  secondaryFilterChips,
  typePatch,
} from './secondary-filters'
import {
  DEFAULT_URL_FILTERS,
  hasActiveFilters,
  type UrlFilterState,
} from '../../services/filters/url-filters'

const state = (patch: Partial<UrlFilterState>): UrlFilterState => ({
  ...DEFAULT_URL_FILTERS,
  ...patch,
})

describe('secondaryFilterChips', () => {
  it('has none by default', () => {
    expect(secondaryFilterChips(state({}))).toEqual([])
  })

  it('gives one chip per account', () => {
    expect(
      secondaryFilterChips(state({ accounts: ['credit_card', 'bank_account'] }))
    ).toEqual([
      { label: 'Cuenta: Tarjeta', clear: { accounts: ['bank_account'] } },
      {
        label: 'Cuenta: Cuenta bancaria',
        clear: { accounts: ['credit_card'] },
      },
    ])
  })

  it('labels the type', () => {
    expect(secondaryFilterChips(state({ type: 'credit' }))).toEqual([
      { label: 'Tipo: Ingresos', clear: { type: 'all' } },
    ])
    expect(secondaryFilterChips(state({ type: 'debit' }))).toEqual([
      { label: 'Tipo: Gastos', clear: { type: 'all' } },
    ])
  })

  it('labels the currency as the control does', () => {
    expect(secondaryFilterChips(state({ currency: 'UYU' }))).toEqual([
      { label: 'Moneda: $U', clear: { currency: 'all' } },
    ])
    expect(secondaryFilterChips(state({ currency: 'USD' }))).toEqual([
      { label: 'Moneda: US$', clear: { currency: 'all' } },
    ])
  })

  it('joins the amount bounds into one chip', () => {
    expect(secondaryFilterChips(state({ min: '50', max: '500' }))).toEqual([
      { label: 'Monto: 50–500', clear: { min: '', max: '' } },
    ])
    expect(secondaryFilterChips(state({ min: '50' }))[0].label).toBe(
      'Monto: 50–∞'
    )
    expect(secondaryFilterChips(state({ max: '9' }))[0].label).toBe(
      'Monto: 0–9'
    )
  })

  it('says when ignored transfers are shown', () => {
    expect(secondaryFilterChips(state({ showIgnored: true }))).toEqual([
      {
        label: 'Ignorados: visibles',
        clear: { showIgnored: false },
      },
    ])
  })

  it('keeps the order: accounts, type, currency, amount, transfers', () => {
    expect(
      secondaryFilterChips(
        state({
          showIgnored: true,
          max: '9',
          currency: 'USD',
          type: 'debit',
          accounts: ['credit_card'],
        })
      ).map((c) => c.label)
    ).toEqual([
      'Cuenta: Tarjeta',
      'Tipo: Gastos',
      'Moneda: US$',
      'Monto: 0–9',
      'Ignorados: visibles',
    ])
  })
})

describe('SECONDARY_FILTERS_CLEARED', () => {
  it('puts every secondary filter back and touches nothing else', () => {
    expect(SECONDARY_FILTERS_CLEARED).toEqual({
      accounts: [],
      type: 'all',
      currency: 'all',
      min: '',
      max: '',
      showIgnored: false,
    })
    const only = state({
      accounts: ['credit_card'],
      type: 'debit',
      currency: 'UYU',
      min: '1',
      max: '2',
      showIgnored: true,
    })
    expect(hasActiveFilters(only)).toBe(true)
    expect(hasActiveFilters({ ...only, ...SECONDARY_FILTERS_CLEARED })).toBe(
      false
    )
  })
})

describe('Hogar and income never combine', () => {
  it('turning Hogar on puts income back to Ambos', () => {
    expect(householdTogglePatch({ household: 'all', type: 'credit' })).toEqual({
      household: 'household',
      type: 'all',
    })
    expect(householdTogglePatch({ household: 'all', type: 'debit' })).toEqual({
      household: 'household',
    })
  })

  it('turning Hogar off keeps the type', () => {
    expect(
      householdTogglePatch({ household: 'household', type: 'debit' })
    ).toEqual({ household: 'all' })
  })

  it('picking Ingresos under Hogar drops Hogar; Gastos keeps it', () => {
    expect(typePatch({ household: 'household' }, 'credit')).toEqual({
      type: 'credit',
      household: 'all',
    })
    expect(typePatch({ household: 'household' }, 'debit')).toEqual({
      type: 'debit',
    })
    expect(typePatch({ household: 'all' }, 'credit')).toEqual({
      type: 'credit',
    })
  })
})
