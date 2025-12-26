import { describe, it, expect } from 'vitest'
import {
  parseSantanderNumber,
  parseSantanderDate,
  generateTransactionId,
} from './utils'

describe('Parser Utilities', () => {
  describe('parseSantanderNumber', () => {
    it('should parse number with comma decimal separator', () => {
      const result = parseSantanderNumber('1.878,39')
      expect(result).toBe(1878.39)
    })

    it('should parse number with thousands separator', () => {
      const result = parseSantanderNumber('58.259,16')
      expect(result).toBe(58259.16)
    })

    it('should parse number with hundreds of thousands', () => {
      const result = parseSantanderNumber('270.000,00')
      expect(result).toBe(270000.0)
    })

    it('should parse negative numbers', () => {
      const result = parseSantanderNumber('-1.463,54')
      expect(result).toBe(-1463.54)
    })

    it('should parse zero', () => {
      const result = parseSantanderNumber('0,00')
      expect(result).toBe(0)
    })

    it('should parse simple decimal number', () => {
      const result = parseSantanderNumber('10,37')
      expect(result).toBe(10.37)
    })

    it('should handle numbers without decimal part', () => {
      const result = parseSantanderNumber('100')
      expect(result).toBe(100)
    })

    it('should handle empty string as zero', () => {
      const result = parseSantanderNumber('')
      expect(result).toBe(0)
    })

    it('should handle decimal numbers (US format from bank accounts)', () => {
      const result = parseSantanderNumber('174.65')
      expect(result).toBe(174.65)
    })

    it('should handle large decimal numbers (US format)', () => {
      const result = parseSantanderNumber('11749.61')
      expect(result).toBe(11749.61)
    })
  })

  describe('parseSantanderDate', () => {
    it('should parse date in DD/MM/YYYY format', () => {
      const result = parseSantanderDate('04/11/2025')
      expect(result).toBeInstanceOf(Date)
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(10) // November (0-indexed)
      expect(result.getDate()).toBe(4)
    })

    it('should parse date with single digit day', () => {
      const result = parseSantanderDate('7/11/2025')
      expect(result.getDate()).toBe(7)
      expect(result.getMonth()).toBe(10)
    })

    it('should parse date with single digit month', () => {
      const result = parseSantanderDate('17/3/2025')
      expect(result.getDate()).toBe(17)
      expect(result.getMonth()).toBe(2) // March
    })

    it('should parse date at start of year', () => {
      const result = parseSantanderDate('01/01/2025')
      expect(result.getMonth()).toBe(0) // January
      expect(result.getDate()).toBe(1)
    })

    it('should parse date at end of year', () => {
      const result = parseSantanderDate('31/12/2025')
      expect(result.getMonth()).toBe(11) // December
      expect(result.getDate()).toBe(31)
    })

    it('should set time to midnight', () => {
      const result = parseSantanderDate('04/11/2025')
      expect(result.getHours()).toBe(0)
      expect(result.getMinutes()).toBe(0)
      expect(result.getSeconds()).toBe(0)
      expect(result.getMilliseconds()).toBe(0)
    })
  })

  describe('generateTransactionId', () => {
    it('should generate consistent ID for same inputs', () => {
      const id1 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39')
      const id2 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39')
      expect(id1).toBe(id2)
    })

    it('should generate different IDs for different dates', () => {
      const id1 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39')
      const id2 = generateTransactionId('05/11/2025', 'Devoto', '1.878,39')
      expect(id1).not.toBe(id2)
    })

    it('should generate different IDs for different descriptions', () => {
      const id1 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39')
      const id2 = generateTransactionId('04/11/2025', 'Jetbrains', '1.878,39')
      expect(id1).not.toBe(id2)
    })

    it('should generate different IDs for different amounts', () => {
      const id1 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39')
      const id2 = generateTransactionId('04/11/2025', 'Devoto', '2.000,00')
      expect(id1).not.toBe(id2)
    })

    it('should handle optional index parameter', () => {
      const id1 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39', 0)
      const id2 = generateTransactionId('04/11/2025', 'Devoto', '1.878,39', 1)
      expect(id1).not.toBe(id2)
    })

    it('should generate IDs for duplicate transactions on same date', () => {
      const id1 = generateTransactionId(
        '06/11/2025',
        'Pago Supernet',
        '0,00',
        0
      )
      const id2 = generateTransactionId(
        '06/11/2025',
        'Pago Supernet',
        '-2.238,54',
        1
      )
      expect(id1).not.toBe(id2)
    })
  })
})
