import { describe, it, expect } from 'vitest'
import {
  tokenize,
  diceCoefficient,
  bigramSimilarity,
  fuzzyTokenSimilarity,
} from './tokenizer'

describe('Tokenizer', () => {
  describe('tokenize', () => {
    it('should lowercase and split on whitespace', () => {
      expect(tokenize('Devoto Supermercado')).toEqual([
        'devoto',
        'supermercado',
      ])
    })

    it('should strip diacritics', () => {
      expect(tokenize('Débito Automático')).toEqual([])
      // both are stopwords after stripping
    })

    it('should strip diacritics from non-stopwords', () => {
      expect(tokenize('Farmácia')).toEqual(['farmacia'])
    })

    it('should remove stopwords', () => {
      const tokens = tokenize('Devoto SA Visa Deb Aut')
      expect(tokens).toEqual(['devoto'])
    })

    it('should remove numeric-only tokens', () => {
      expect(tokenize('Spotify P3d110f721')).toEqual([
        'spotify',
        'p3d110f721',
      ])
    })

    it('should remove short tokens (< 2 chars)', () => {
      expect(tokenize('A B CC DD')).toEqual(['cc', 'dd'])
    })

    it('should split on punctuation', () => {
      expect(tokenize('Netflix.Com')).toEqual(['netflix'])
    })

    it('should deduplicate tokens', () => {
      expect(tokenize('devoto devoto')).toEqual(['devoto'])
    })

    it('should handle empty string', () => {
      expect(tokenize('')).toEqual([])
    })

    it('should handle typical bank descriptions', () => {
      const tokens = tokenize('ANCAP CASA ANON SA')
      expect(tokens).toContain('ancap')
      expect(tokens).toContain('casa')
      expect(tokens).toContain('anon')
      expect(tokens).not.toContain('sa')
    })
  })

  describe('diceCoefficient', () => {
    it('should return 1 for identical sets', () => {
      expect(diceCoefficient(['a', 'b'], ['a', 'b'])).toBe(1)
    })

    it('should return 0 for disjoint sets', () => {
      expect(diceCoefficient(['a', 'b'], ['c', 'd'])).toBe(0)
    })

    it('should return expected value for partial overlap', () => {
      // 2 * 1 / (2 + 3) = 0.4
      expect(diceCoefficient(['a', 'b'], ['a', 'c', 'd'])).toBeCloseTo(0.4)
    })

    it('should return 0 when either set is empty', () => {
      expect(diceCoefficient([], ['a'])).toBe(0)
      expect(diceCoefficient(['a'], [])).toBe(0)
    })

    it('should return 0 for two empty sets', () => {
      expect(diceCoefficient([], [])).toBe(0)
    })
  })

  describe('bigramSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(bigramSimilarity('hello', 'hello')).toBe(1)
    })

    it('should return 0 for completely different strings', () => {
      expect(bigramSimilarity('abc', 'xyz')).toBe(0)
    })

    it('should return high similarity for similar strings', () => {
      const sim = bigramSimilarity('devoto', 'devotto')
      expect(sim).toBeGreaterThan(0.7)
    })

    it('should handle single character strings', () => {
      expect(bigramSimilarity('a', 'b')).toBe(0)
    })

    it('should handle empty strings', () => {
      expect(bigramSimilarity('', 'hello')).toBe(0)
    })
  })

  describe('fuzzyTokenSimilarity', () => {
    it('should return 1 for identical token sets', () => {
      expect(
        fuzzyTokenSimilarity(['devoto', 'supermercado'], ['devoto', 'supermercado'])
      ).toBe(1)
    })

    it('should handle prefix matches well', () => {
      const score = fuzzyTokenSimilarity(
        ['devoto', 'sup'],
        ['devoto', 'supermercado']
      )
      expect(score).toBeGreaterThan(0.5)
    })

    it('should return 0 for empty arrays', () => {
      expect(fuzzyTokenSimilarity([], ['a'])).toBe(0)
      expect(fuzzyTokenSimilarity(['a'], [])).toBe(0)
    })

    it('should score completely unrelated tokens low', () => {
      const score = fuzzyTokenSimilarity(['xyz', 'abc'], ['devoto', 'super'])
      expect(score).toBeLessThan(0.3)
    })

    it('should handle single-token partial matches', () => {
      const score = fuzzyTokenSimilarity(['farmashop'], ['farmacia'])
      expect(score).toBeGreaterThan(0.4)
    })
  })
})
