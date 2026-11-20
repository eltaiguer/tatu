import { describe, expect, it } from 'vitest'
import { monthSpanLabel, shortMonthLabel } from './period-label'

describe('shortMonthLabel', () => {
  it('names a month in lowercase mid-sentence form', () => {
    expect(shortMonthLabel('2025-11')).toBe('nov. 2025')
    expect(shortMonthLabel('2026-01')).toBe('ene. 2026')
  })
})

describe('monthSpanLabel', () => {
  it('spans from the first month to the last with an en dash', () => {
    expect(monthSpanLabel('2025-03-04', '2025-12-20')).toBe(
      'mar. 2025 – dic. 2025'
    )
  })

  it('names one month once', () => {
    expect(monthSpanLabel('2025-11-03', '2025-11-27')).toBe('nov. 2025')
  })
})
