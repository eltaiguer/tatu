import { describe, expect, it } from 'vitest'
import {
  buildDescriptionOverrideKey,
  normalizeDescriptionForOverride,
} from './normalization'

describe('normalizeDescriptionForOverride', () => {
  it('normalizes case, accents and punctuation', () => {
    expect(
      normalizeDescriptionForOverride('  Dévoto   Super-Mercado!!!  ')
    ).toBe('devoto super mercado')
  })

  it('removes variable date/time/id tokens', () => {
    expect(
      normalizeDescriptionForOverride(
        'AUT 998877 DEVOTO 12/03/2026 14:51 REF-ABC-999999'
      )
    ).toBe('devoto')
  })

  it('preserves stable merchant words', () => {
    expect(
      normalizeDescriptionForOverride('Transferencia recibida SetA Workshop')
    ).toBe('transferencia recibida seta workshop')
  })

  it('builds a raw fallback key when normalization is empty', () => {
    expect(buildDescriptionOverrideKey('---- 123456 ----')).toBe(
      'raw:---- 123456 ----'
    )
  })

  it('returns null key for blank descriptions', () => {
    expect(buildDescriptionOverrideKey('   ')).toBeNull()
  })
})
