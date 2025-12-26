import { describe, it, expect } from 'vitest'
import {
  normalizeMerchantName,
  matchMerchantPattern,
  getMerchantCategory,
} from './merchant-patterns'
import { Category } from '../../models'

describe('Merchant Pattern Matcher', () => {
  describe('normalizeMerchantName', () => {
    it('should convert to lowercase', () => {
      expect(normalizeMerchantName('DEVOTO SUPERMERCADO')).toBe(
        'devoto supermercado'
      )
    })

    it('should trim whitespace', () => {
      expect(normalizeMerchantName('  Devoto  ')).toBe('devoto')
    })

    it('should remove extra spaces', () => {
      expect(normalizeMerchantName('Devoto   Supermercado')).toBe(
        'devoto supermercado'
      )
    })

    it('should handle special characters', () => {
      expect(normalizeMerchantName('Antel Móvil Débito')).toContain('antel')
    })

    it('should handle empty string', () => {
      expect(normalizeMerchantName('')).toBe('')
    })

    it('should normalize Merpago merchants', () => {
      expect(normalizeMerchantName('Merpago Tupase')).toBe('merpago tupase')
    })
  })

  describe('matchMerchantPattern - Groceries', () => {
    it('should match Devoto', () => {
      const result = matchMerchantPattern('Devoto Supermercado')
      expect(result?.category).toBe(Category.Groceries)
      expect(result?.confidence).toBeGreaterThan(0.5)
    })

    it('should match Supermercado keyword', () => {
      const result = matchMerchantPattern('Algun Supermercado')
      expect(result?.category).toBe(Category.Groceries)
    })

    it('should match Super Sol', () => {
      const result = matchMerchantPattern('Super Sol')
      expect(result?.category).toBe(Category.Groceries)
    })

    it('should match Provicentro', () => {
      const result = matchMerchantPattern('Provicentro Carlitos')
      expect(result?.category).toBe(Category.Groceries)
    })

    it('should match Carniceria', () => {
      const result = matchMerchantPattern('Carniceria Velsen')
      expect(result?.category).toBe(Category.Groceries)
    })

    it('should match Panaderia', () => {
      const result = matchMerchantPattern('Panaderia Maracana')
      expect(result?.category).toBe(Category.Groceries)
    })
  })

  describe('matchMerchantPattern - Restaurants', () => {
    it('should match Sopranos', () => {
      const result = matchMerchantPattern('Sopranos')
      expect(result?.category).toBe(Category.Restaurants)
    })

    it('should match Ondero Cafe', () => {
      const result = matchMerchantPattern('Ondero Cafe')
      expect(result?.category).toBe(Category.Restaurants)
    })

    it('should match restaurants with Cafe keyword', () => {
      const result = matchMerchantPattern('Cultocafe')
      expect(result?.category).toBe(Category.Restaurants)
    })

    it('should match PedidosYa', () => {
      const result = matchMerchantPattern('Pedidosya')
      expect(result?.category).toBe(Category.Restaurants)
    })
  })

  describe('matchMerchantPattern - Utilities', () => {
    it('should match Antel', () => {
      const result = matchMerchantPattern('Antel Fijo Deb Aut')
      expect(result?.category).toBe(Category.Utilities)
      expect(result?.confidence).toBeGreaterThan(0.8)
    })

    it('should match UTE', () => {
      const result = matchMerchantPattern('Ute Debito Automatico')
      expect(result?.category).toBe(Category.Utilities)
      expect(result?.confidence).toBeGreaterThan(0.8)
    })

    it('should match OSE', () => {
      const result = matchMerchantPattern('OSE Debito')
      expect(result?.category).toBe(Category.Utilities)
    })
  })

  describe('matchMerchantPattern - Healthcare', () => {
    it('should match Farmashop', () => {
      const result = matchMerchantPattern('Farmashop Visa')
      expect(result?.category).toBe(Category.Healthcare)
    })

    it('should match Summum', () => {
      const result = matchMerchantPattern('Summum Medicina Privada')
      expect(result?.category).toBe(Category.Healthcare)
    })

    it('should match generic pharmacy', () => {
      const result = matchMerchantPattern('Farmacia Central')
      expect(result?.category).toBe(Category.Healthcare)
    })
  })

  describe('matchMerchantPattern - Software', () => {
    it('should match Jetbrains', () => {
      const result = matchMerchantPattern('Jetbrains Americas Inc')
      expect(result?.category).toBe(Category.Software)
    })

    it('should match Atlassian', () => {
      const result = matchMerchantPattern('Atlassian')
      expect(result?.category).toBe(Category.Software)
    })

    it('should match AWS', () => {
      const result = matchMerchantPattern('Amazon Web Services')
      expect(result?.category).toBe(Category.Software)
    })

    it('should match Claude AI', () => {
      const result = matchMerchantPattern('Claude Ai Subscription')
      expect(result?.category).toBe(Category.Software)
    })

    it('should match Upwork', () => {
      const result = matchMerchantPattern('Upwork 866561258Membersh')
      expect(result?.category).toBe(Category.Software)
    })

    it('should match BambooHR', () => {
      const result = matchMerchantPattern('Bamboohr Hris')
      expect(result?.category).toBe(Category.Software)
    })
  })

  describe('matchMerchantPattern - Entertainment', () => {
    it('should match Spotify', () => {
      const result = matchMerchantPattern('Spotify P3d110f721')
      expect(result?.category).toBe(Category.Entertainment)
    })

    it('should match Netflix', () => {
      const result = matchMerchantPattern('Netflix.Com')
      expect(result?.category).toBe(Category.Entertainment)
    })
  })

  describe('matchMerchantPattern - Shopping', () => {
    it('should match Sodimac', () => {
      const result = matchMerchantPattern('Sodimac Web')
      expect(result?.category).toBe(Category.Shopping)
    })

    it('should match Adidas', () => {
      const result = matchMerchantPattern('Adidas Us Online Store')
      expect(result?.category).toBe(Category.Shopping)
    })

    it('should match Vans', () => {
      const result = matchMerchantPattern('Vans')
      expect(result?.category).toBe(Category.Shopping)
    })

    it('should match Harrington', () => {
      const result = matchMerchantPattern('Harrington')
      expect(result?.category).toBe(Category.Shopping)
    })

    it('should match Toto Calzado', () => {
      const result = matchMerchantPattern('Toto Calzado 15')
      expect(result?.category).toBe(Category.Shopping)
    })

    it('should match Shopping keyword', () => {
      const result = matchMerchantPattern('Shopping 3 Cruces Adm')
      expect(result?.category).toBe(Category.Shopping)
    })
  })

  describe('matchMerchantPattern - Transport', () => {
    it('should match ANCAP', () => {
      const result = matchMerchantPattern('Ancap Casa Anon Sa')
      expect(result?.category).toBe(Category.Transport)
    })

    it('should match gas stations', () => {
      const result = matchMerchantPattern('Puesto Ezequi.Handy.')
      expect(result?.category).toBe(Category.Transport)
    })
  })

  describe('matchMerchantPattern - Insurance', () => {
    it('should match Zurich', () => {
      const result = matchMerchantPattern('Zurich Santander')
      expect(result?.category).toBe(Category.Insurance)
    })

    it('should match Automovil Club', () => {
      const result = matchMerchantPattern('Automovil Club Uruguay')
      expect(result?.category).toBe(Category.Insurance)
    })

    it('should match Seguro keyword', () => {
      const result = matchMerchantPattern('Seguro Saldo Deudor')
      expect(result?.category).toBe(Category.Insurance)
    })
  })

  describe('getMerchantCategory', () => {
    it('should return category and confidence for known merchant', () => {
      const result = getMerchantCategory('Devoto Supermercado')
      expect(result.category).toBe(Category.Groceries)
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it('should return Uncategorized for unknown merchant', () => {
      const result = getMerchantCategory('Random Unknown Merchant')
      expect(result.category).toBe(Category.Uncategorized)
      expect(result.confidence).toBe(0)
    })

    it('should handle empty merchant name', () => {
      const result = getMerchantCategory('')
      expect(result.category).toBe(Category.Uncategorized)
      expect(result.confidence).toBe(0)
    })

    it('should be case-insensitive', () => {
      const result1 = getMerchantCategory('devoto supermercado')
      const result2 = getMerchantCategory('DEVOTO SUPERMERCADO')
      expect(result1.category).toBe(result2.category)
    })

    it('should handle partial matches with lower confidence', () => {
      const exactMatch = getMerchantCategory('Devoto Supermercado')
      const partialMatch = getMerchantCategory('Devoto')

      expect(exactMatch.category).toBe(Category.Groceries)
      expect(partialMatch.category).toBe(Category.Groceries)
      expect(exactMatch.confidence).toBeGreaterThanOrEqual(
        partialMatch.confidence
      )
    })
  })
})
