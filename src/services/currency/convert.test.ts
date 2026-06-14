import { describe, it, expect } from 'vitest'
import { convert } from './convert'

describe('convert', () => {
  it('returns amount unchanged when from and to are the same currency', () => {
    expect(convert(100, 'USD', 'USD', 40)).toBe(100)
    expect(convert(500, 'UYU', 'UYU', 40)).toBe(500)
  })

  it('converts USD to UYU by multiplying by rate', () => {
    expect(convert(1, 'USD', 'UYU', 40)).toBe(40)
    expect(convert(10, 'USD', 'UYU', 40.5)).toBeCloseTo(405)
  })

  it('converts UYU to USD by dividing by rate', () => {
    expect(convert(40, 'UYU', 'USD', 40)).toBe(1)
    expect(convert(81, 'UYU', 'USD', 40.5)).toBeCloseTo(2)
  })

  it('throws for zero rate', () => {
    expect(() => convert(100, 'USD', 'UYU', 0)).toThrow(
      'FX rate must be a positive finite number'
    )
  })

  it('throws for negative rate', () => {
    expect(() => convert(100, 'USD', 'UYU', -1)).toThrow(
      'FX rate must be a positive finite number'
    )
  })

  it('throws for NaN rate', () => {
    expect(() => convert(100, 'USD', 'UYU', NaN)).toThrow(
      'FX rate must be a positive finite number'
    )
  })
})
