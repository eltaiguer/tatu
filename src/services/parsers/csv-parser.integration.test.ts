import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseCSV, detectFileType } from './csv-parser'

describe('CSV Parser - Integration Tests with All Sample Files', () => {
  describe('Auto-detection and parsing', () => {
    it('should auto-detect and parse credit card sample file', () => {
      const samplePath = join(
        process.cwd(),
        'samples',
        'CreditCardsMovementsDetail.csv'
      )
      const csvContent = readFileSync(samplePath, 'utf-8')

      // Test detection
      const detectedType = detectFileType(csvContent)
      expect(detectedType).toBe('credit_card')

      // Test parsing
      const result = parseCSV(csvContent, 'CreditCardsMovementsDetail.csv')

      expect(result.fileType).toBe('credit_card')
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.fileName).toBe('CreditCardsMovementsDetail.csv')

      // Verify it's credit card metadata
      if ('numeroTarjeta' in result.metadata) {
        expect(result.metadata.numeroTarjeta).toContain('XXXXX')
        expect(result.metadata.cliente).toBeTruthy()
      } else {
        throw new Error('Expected CreditCardMetadata')
      }

      // Verify transactions are valid
      result.transactions.forEach((tx) => {
        expect(tx.source).toBe('credit_card')
        expect(['USD', 'UYU']).toContain(tx.currency)
      })
    })

    it('should auto-detect and parse USD bank account sample file', () => {
      const samplePath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      // Test detection
      const detectedType = detectFileType(csvContent)
      expect(detectedType).toBe('bank_account_usd')

      // Test parsing
      const result = parseCSV(csvContent, 'USDmovements.csv')

      expect(result.fileType).toBe('bank_account_usd')
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.fileName).toBe('USDmovements.csv')

      // Verify it's bank account metadata
      if ('moneda' in result.metadata) {
        expect(result.metadata.moneda).toBe('USD')
        expect(result.metadata.cliente).toBeTruthy()
        expect(result.metadata.numero).toBeTruthy()
      } else {
        throw new Error('Expected BankAccountMetadata')
      }

      // Verify all transactions are USD
      result.transactions.forEach((tx) => {
        expect(tx.currency).toBe('USD')
        expect(tx.source).toBe('bank_account')
        expect(tx.balance).toBeDefined()
      })
    })

    it('should auto-detect and parse UYU bank account sample file', () => {
      const samplePath = join(process.cwd(), 'samples', 'UYUmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      // Test detection
      const detectedType = detectFileType(csvContent)
      expect(detectedType).toBe('bank_account_uyu')

      // Test parsing
      const result = parseCSV(csvContent, 'UYUmovements.csv')

      expect(result.fileType).toBe('bank_account_uyu')
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.fileName).toBe('UYUmovements.csv')

      // Verify it's bank account metadata
      if ('moneda' in result.metadata) {
        expect(result.metadata.moneda).toBe('UYU')
        expect(result.metadata.cliente).toBeTruthy()
      } else {
        throw new Error('Expected BankAccountMetadata')
      }

      // Verify all transactions are UYU
      result.transactions.forEach((tx) => {
        expect(tx.currency).toBe('UYU')
        expect(tx.source).toBe('bank_account')
        expect(tx.balance).toBeDefined()
      })
    })
  })

  describe('Unified parsing of all three file types', () => {
    it('should parse all three sample files successfully', () => {
      const creditCardPath = join(
        process.cwd(),
        'samples',
        'CreditCardsMovementsDetail.csv'
      )
      const usdPath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const uyuPath = join(process.cwd(), 'samples', 'UYUmovements.csv')

      const creditCardContent = readFileSync(creditCardPath, 'utf-8')
      const usdContent = readFileSync(usdPath, 'utf-8')
      const uyuContent = readFileSync(uyuPath, 'utf-8')

      // Parse all three using the same unified parser
      const creditCardResult = parseCSV(
        creditCardContent,
        'CreditCardsMovementsDetail.csv'
      )
      const usdResult = parseCSV(usdContent, 'USDmovements.csv')
      const uyuResult = parseCSV(uyuContent, 'UYUmovements.csv')

      // All should succeed
      expect(creditCardResult.transactions.length).toBeGreaterThan(0)
      expect(usdResult.transactions.length).toBeGreaterThan(0)
      expect(uyuResult.transactions.length).toBeGreaterThan(0)

      // File types should be correct
      expect(creditCardResult.fileType).toBe('credit_card')
      expect(usdResult.fileType).toBe('bank_account_usd')
      expect(uyuResult.fileType).toBe('bank_account_uyu')

      // No errors
      expect(creditCardResult.errors).toBeUndefined()
      expect(usdResult.errors).toBeUndefined()
      expect(uyuResult.errors).toBeUndefined()
    })

    it('should extract valid dates from all file types', () => {
      const creditCardPath = join(
        process.cwd(),
        'samples',
        'CreditCardsMovementsDetail.csv'
      )
      const usdPath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const uyuPath = join(process.cwd(), 'samples', 'UYUmovements.csv')

      const creditCardContent = readFileSync(creditCardPath, 'utf-8')
      const usdContent = readFileSync(usdPath, 'utf-8')
      const uyuContent = readFileSync(uyuPath, 'utf-8')

      const creditCardResult = parseCSV(creditCardContent, 'cc.csv')
      const usdResult = parseCSV(usdContent, 'usd.csv')
      const uyuResult = parseCSV(uyuContent, 'uyu.csv')

      // All transactions should have valid dates
      const allTransactions = [
        ...creditCardResult.transactions,
        ...usdResult.transactions,
        ...uyuResult.transactions,
      ]

      allTransactions.forEach((tx) => {
        expect(tx.date).toBeInstanceOf(Date)
        expect(tx.date.toString()).not.toBe('Invalid Date')
        expect(tx.date.getFullYear()).toBeGreaterThan(2020)
        expect(tx.date.getFullYear()).toBeLessThan(2030)
      })
    })

    it('should have unique IDs across all transactions', () => {
      const creditCardPath = join(
        process.cwd(),
        'samples',
        'CreditCardsMovementsDetail.csv'
      )
      const usdPath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const uyuPath = join(process.cwd(), 'samples', 'UYUmovements.csv')

      const creditCardContent = readFileSync(creditCardPath, 'utf-8')
      const usdContent = readFileSync(usdPath, 'utf-8')
      const uyuContent = readFileSync(uyuPath, 'utf-8')

      const creditCardResult = parseCSV(creditCardContent, 'cc.csv')
      const usdResult = parseCSV(usdContent, 'usd.csv')
      const uyuResult = parseCSV(uyuContent, 'uyu.csv')

      // Get all IDs from each file
      const ccIds = creditCardResult.transactions.map((tx) => tx.id)
      const usdIds = usdResult.transactions.map((tx) => tx.id)
      const uyuIds = uyuResult.transactions.map((tx) => tx.id)

      // Each file should have unique IDs within itself
      expect(new Set(ccIds).size).toBe(ccIds.length)
      expect(new Set(usdIds).size).toBe(usdIds.length)
      expect(new Set(uyuIds).size).toBe(uyuIds.length)
    })

    it('should preserve raw data in all parsed transactions', () => {
      const creditCardPath = join(
        process.cwd(),
        'samples',
        'CreditCardsMovementsDetail.csv'
      )
      const creditCardContent = readFileSync(creditCardPath, 'utf-8')
      const result = parseCSV(creditCardContent, 'cc.csv')

      // All transactions should have raw data
      result.transactions.forEach((tx) => {
        expect(tx.rawData).toBeDefined()
        expect(typeof tx.rawData).toBe('object')
      })
    })
  })

  describe('Error handling', () => {
    it('should throw error for invalid CSV content', () => {
      const invalidCSV = 'This is not a valid Santander CSV\nJust random data'

      expect(() => parseCSV(invalidCSV, 'invalid.csv')).toThrow(
        'Unable to detect CSV file type'
      )
    })

    it('should throw error for empty CSV', () => {
      const emptyCSV = ''

      expect(() => parseCSV(emptyCSV, 'empty.csv')).toThrow()
    })

    it('should throw error for CSV with wrong format', () => {
      const wrongFormatCSV = 'Name,Age,City\nJohn,30,NYC\nJane,25,LA'

      expect(() => parseCSV(wrongFormatCSV, 'wrong.csv')).toThrow()
    })
  })
})
