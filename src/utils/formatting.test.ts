import { describe, it, expect } from 'vitest'
import {
  toSafeNumber,
  formatCurrency,
  formatCurrencyShort,
  formatDate,
  formatDateCompact,
  fitMonoFontSize,
} from './formatting'

describe('toSafeNumber', () => {
  it('returns finite numbers unchanged', () => {
    expect(toSafeNumber(42)).toBe(42)
    expect(toSafeNumber(-100)).toBe(-100)
    expect(toSafeNumber(0)).toBe(0)
  })

  it('clamps NaN to 0', () => {
    expect(toSafeNumber(NaN)).toBe(0)
  })

  it('clamps Infinity to 0', () => {
    expect(toSafeNumber(Infinity)).toBe(0)
    expect(toSafeNumber(-Infinity)).toBe(0)
  })
})

describe('formatCurrency', () => {
  it('formats UYU with $U symbol', () => {
    expect(formatCurrency(1234.5, 'UYU')).toBe('$U 1.234,50')
  })

  it('formats USD with US$ symbol', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('US$ 1.234,50')
  })

  it('always renders absolute value (strips sign)', () => {
    expect(formatCurrency(-500, 'UYU')).toBe('$U 500,00')
  })

  it('clamps NaN to zero', () => {
    expect(formatCurrency(NaN, 'USD')).toBe('US$ 0,00')
  })

  it('clamps Infinity to zero', () => {
    expect(formatCurrency(Infinity, 'UYU')).toBe('$U 0,00')
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0, 'USD')).toBe('US$ 0,00')
  })
})

describe('formatCurrencyShort', () => {
  it('formats values under 1k as whole numbers', () => {
    expect(formatCurrencyShort(999.4, 'UYU')).toBe('$U 999')
  })

  it('abbreviates thousands with k', () => {
    expect(formatCurrencyShort(1500, 'UYU')).toBe('$U 2k')
  })

  it('abbreviates millions with M', () => {
    expect(formatCurrencyShort(2_500_000, 'USD')).toBe('US$ 2.5M')
  })

  it('keeps the minus sign on negative values (chart ticks below zero)', () => {
    expect(formatCurrencyShort(-12_000, 'USD')).toBe('-US$ 12k')
    expect(formatCurrencyShort(-2_500_000, 'USD')).toBe('-US$ 2.5M')
    expect(formatCurrencyShort(-500, 'UYU')).toBe('-$U 500')
  })

  it('renders zero and small round values without decimals', () => {
    expect(formatCurrencyShort(0, 'USD')).toBe('US$ 0')
    expect(formatCurrencyShort(999, 'UYU')).toBe('$U 999')
  })

  it('uses the magnitude for threshold comparison', () => {
    expect(formatCurrencyShort(-2000, 'UYU')).toBe('-$U 2k')
  })

  it('clamps NaN to zero', () => {
    expect(formatCurrencyShort(NaN, 'USD')).toBe('US$ 0')
  })
})

describe('formatDate', () => {
  it('formats date in es-UY locale (dd/mm/yyyy)', () => {
    const date = new Date('2025-06-15T12:00:00Z')
    expect(formatDate(date)).toBe('15/06/2025')
  })

  it('pads single-digit day and month', () => {
    const date = new Date('2025-01-03T12:00:00Z')
    expect(formatDate(date)).toBe('03/01/2025')
  })
})

describe('fitMonoFontSize', () => {
  it('caps at the max size and shrinks longer strings more', () => {
    expect(fitMonoFontSize('US$ 9,00', 22)).toMatch(/^min\(22px, [\d.]+cqi\)$/)
    const cqi = (s: string) =>
      Number(/([\d.]+)cqi/.exec(fitMonoFontSize(s, 22))![1])
    expect(cqi('-$U 1.234.567,89')).toBeLessThan(cqi('US$ 9,00'))
  })

  it('leaves room for every glyph at 0.6em per character', () => {
    const value = '-US$ 1.468,14'
    const cqi = Number(/([\d.]+)cqi/.exec(fitMonoFontSize(value, 22))![1])
    // width used = chars × 0.6em, with em = cqi% of the container
    expect(value.length * 0.6 * cqi).toBeLessThanOrEqual(100)
  })
})

// #58: transaction dates are calendar days stored at UTC midnight; rows
// imported before #58 from Uruguay sit at 03:00Z. Both show their own day in
// any browser zone.
describe('transaction date display', () => {
  const NEW_ROW = new Date('2026-03-01T00:00:00.000Z')
  const PRE_58_ROW = new Date('2026-03-01T03:00:00.000Z')

  it('formatDate shows the stored calendar day', () => {
    expect(formatDate(NEW_ROW)).toBe('01/03/2026')
    expect(formatDate(PRE_58_ROW)).toBe('01/03/2026')
  })

  it('formatDateCompact shows the stored calendar day', () => {
    expect(formatDateCompact(NEW_ROW)).toBe(formatDateCompact(PRE_58_ROW))
    expect(formatDateCompact(NEW_ROW)).toMatch(/^1 mar/)
  })
})
