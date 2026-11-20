import { describe, expect, it } from 'vitest'
import { shortMonthLabel } from './period-label'

describe('shortMonthLabel', () => {
  it('names a month in lowercase mid-sentence form', () => {
    expect(shortMonthLabel('2025-11')).toBe('nov. 2025')
    expect(shortMonthLabel('2026-01')).toBe('ene. 2026')
  })
})
