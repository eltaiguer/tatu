import { describe, it, expect } from 'vitest'
import { Category } from '../../models'
import { findSimilarMerchant } from './similar-merchant'

const KNOWN_MERCHANTS = [
  { name: 'Farmacia Central', category: Category.Healthcare },
  { name: 'Supermercado Devoto', category: Category.Groceries },
  { name: 'Netflix Streaming', category: Category.Entertainment },
  { name: 'Ancap Estacion Sur', category: Category.Transport },
]

describe('Similar Merchant', () => {
  it('should find a similar merchant by shared tokens', () => {
    // More than half of the known merchant's tokens must be anchored
    // (review of #216): "Farmacia del Sol" shares one of two and no longer
    // matches; the merchant list already sends "farmacia" to healthcare.
    const result = findSimilarMerchant('Farmacia Central Sur', KNOWN_MERCHANTS)
    expect(result).not.toBeNull()
    expect(result!.category).toBe(Category.Healthcare)
    expect(result!.matchedPattern).toContain('similar:')
  })

  it('should respect confidence cap', () => {
    const result = findSimilarMerchant('Farmacia Central', KNOWN_MERCHANTS)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBeLessThanOrEqual(0.6)
  })

  it('should return null for completely unknown merchants', () => {
    const result = findSimilarMerchant('Xyzzy Plugh Nothing', KNOWN_MERCHANTS)
    expect(result).toBeNull()
  })

  it('should return null for empty description', () => {
    const result = findSimilarMerchant('', KNOWN_MERCHANTS)
    expect(result).toBeNull()
  })

  it('should return null for empty merchant list', () => {
    const result = findSimilarMerchant('Farmacia Central', [])
    expect(result).toBeNull()
  })

  it('should skip uncategorized merchants', () => {
    const result = findSimilarMerchant('Random Place', [
      { name: 'Random Place Two', category: Category.Uncategorized },
    ])
    expect(result).toBeNull()
  })

  it('should pick the best match among multiple candidates', () => {
    const result = findSimilarMerchant('Devoto Supermercado Web', [
      ...KNOWN_MERCHANTS,
      { name: 'Devoto Online Supermercado', category: Category.Groceries },
    ])
    expect(result).not.toBeNull()
    expect(result!.category).toBe(Category.Groceries)
  })
})

describe('findSimilarMerchant - anchored like the merchant list (review of #216)', () => {
  it('does not match on character bigrams alone', () => {
    expect(
      findSimilarMerchant('La Pantera', [
        { name: 'Antel', category: Category.Utilities },
      ])
    ).toBeNull()
  })

  it('does not match half of a multi-word merchant', () => {
    expect(
      findSimilarMerchant('El Club', [
        { name: 'Automovil Club', category: Category.Insurance },
      ])
    ).toBeNull()
  })

  it('still matches a typo of a known merchant', () => {
    expect(
      findSimilarMerchant('Devotto', [
        { name: 'Devoto', category: Category.Groceries },
      ])?.category
    ).toBe(Category.Groceries)
  })
})
