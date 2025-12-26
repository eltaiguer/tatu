import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseBankAccountCSV } from './bank-account-parser'

describe('Bank Account Parser - Integration Tests with Real Samples', () => {
  describe('USD Account Sample', () => {
    it('should parse the actual USDmovements.csv sample file', () => {
      // Read the actual sample file
      const samplePath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      const result = parseBankAccountCSV(csvContent, 'USDmovements.csv')

      // Verify basic structure
      expect(result.fileType).toBe('bank_account_usd')
      expect(result.transactions.length).toBeGreaterThan(0)

      // Verify metadata was extracted
      const metadata = result.metadata
      if ('moneda' in metadata) {
        expect(metadata.cliente).toBeTruthy()
        expect(metadata.moneda).toBe('USD')
        expect(metadata.numero).toBeTruthy()
        expect(metadata.cuenta).toBeTruthy()
        expect(metadata.periodoDesde).toBeTruthy()
        expect(metadata.periodoHasta).toBeTruthy()
      }

      // Verify all transactions have required fields
      result.transactions.forEach((tx) => {
        expect(tx.id).toBeTruthy()
        expect(tx.date).toBeInstanceOf(Date)
        expect(tx.description).toBeTruthy()
        expect(tx.amount).toBeGreaterThanOrEqual(0)
        expect(tx.currency).toBe('USD')
        expect(['debit', 'credit']).toContain(tx.type)
        expect(tx.source).toBe('bank_account')
        expect(tx.balance).toBeDefined()
        expect(typeof tx.balance).toBe('number')
        expect(tx.rawData).toBeDefined()
      })

      // Check for both debit and credit transactions
      const types = new Set(result.transactions.map((tx) => tx.type))
      expect(types.has('debit')).toBe(true)
      expect(types.has('credit')).toBe(true)
    })

    it('should handle all USD transactions without errors', () => {
      const samplePath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      const result = parseBankAccountCSV(csvContent, 'USDmovements.csv')

      // Should not have errors
      expect(result.errors).toBeUndefined()

      // All transactions should have valid dates
      result.transactions.forEach((tx) => {
        expect(tx.date.toString()).not.toBe('Invalid Date')
        expect(tx.date.getFullYear()).toBeGreaterThan(2020)
      })

      // All transactions should have positive amounts
      result.transactions.forEach((tx) => {
        expect(tx.amount).toBeGreaterThanOrEqual(0)
      })

      // All balances should be non-negative
      result.transactions.forEach((tx) => {
        expect(tx.balance).toBeGreaterThanOrEqual(0)
      })
    })

    it('should correctly identify USD transaction types', () => {
      const samplePath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      const result = parseBankAccountCSV(csvContent, 'USDmovements.csv')

      // Find some known transactions
      const debitTx = result.transactions.find((tx) =>
        tx.description.includes('DEBITO OPERACION')
      )
      expect(debitTx).toBeDefined()
      expect(debitTx?.type).toBe('debit')
      expect(debitTx?.currency).toBe('USD')

      const creditTx = result.transactions.find(
        (tx) => tx.description.includes('PAGO SUELDOS') || tx.type === 'credit'
      )
      expect(creditTx).toBeDefined()
      expect(creditTx?.type).toBe('credit')
      expect(creditTx?.currency).toBe('USD')
    })
  })

  describe('UYU Account Sample', () => {
    it('should parse the actual UYUmovements.csv sample file', () => {
      // Read the actual sample file
      const samplePath = join(process.cwd(), 'samples', 'UYUmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      const result = parseBankAccountCSV(csvContent, 'UYUmovements.csv')

      // Verify basic structure
      expect(result.fileType).toBe('bank_account_uyu')
      expect(result.transactions.length).toBeGreaterThan(0)

      // Verify metadata was extracted
      const metadata = result.metadata
      if ('moneda' in metadata) {
        expect(metadata.cliente).toBeTruthy()
        expect(metadata.moneda).toBe('UYU')
        expect(metadata.numero).toBeTruthy()
      }

      // Verify all transactions have required fields
      result.transactions.forEach((tx) => {
        expect(tx.id).toBeTruthy()
        expect(tx.date).toBeInstanceOf(Date)
        expect(tx.description).toBeTruthy()
        expect(tx.amount).toBeGreaterThanOrEqual(0)
        expect(tx.currency).toBe('UYU')
        expect(['debit', 'credit']).toContain(tx.type)
        expect(tx.source).toBe('bank_account')
        expect(tx.balance).toBeDefined()
        expect(tx.rawData).toBeDefined()
      })
    })

    it('should handle all UYU transactions without errors', () => {
      const samplePath = join(process.cwd(), 'samples', 'UYUmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      const result = parseBankAccountCSV(csvContent, 'UYUmovements.csv')

      // Should not have errors
      expect(result.errors).toBeUndefined()

      // All transactions should have valid dates
      result.transactions.forEach((tx) => {
        expect(tx.date.toString()).not.toBe('Invalid Date')
        expect(tx.date.getFullYear()).toBeGreaterThan(2020)
      })

      // All transactions should have positive amounts
      result.transactions.forEach((tx) => {
        expect(tx.amount).toBeGreaterThanOrEqual(0)
      })
    })

    it('should correctly identify UYU transaction types', () => {
      const samplePath = join(process.cwd(), 'samples', 'UYUmovements.csv')
      const csvContent = readFileSync(samplePath, 'utf-8')

      const result = parseBankAccountCSV(csvContent, 'UYUmovements.csv')

      // Should have both debit and credit transactions
      const types = new Set(result.transactions.map((tx) => tx.type))
      expect(types.has('debit')).toBe(true)
      expect(types.has('credit')).toBe(true)

      // Find some known transactions
      const retiroTx = result.transactions.find((tx) =>
        tx.description.includes('RETIRO')
      )
      if (retiroTx) {
        expect(retiroTx.type).toBe('debit')
        expect(retiroTx.currency).toBe('UYU')
      }

      const creditoTx = result.transactions.find((tx) =>
        tx.description.includes('CREDITO POR OPERACION')
      )
      if (creditoTx) {
        expect(creditoTx.type).toBe('credit')
        expect(creditoTx.currency).toBe('UYU')
      }
    })
  })

  describe('Cross-file validation', () => {
    it('should parse both USD and UYU files with same structure', () => {
      const usdPath = join(process.cwd(), 'samples', 'USDmovements.csv')
      const uyuPath = join(process.cwd(), 'samples', 'UYUmovements.csv')

      const usdContent = readFileSync(usdPath, 'utf-8')
      const uyuContent = readFileSync(uyuPath, 'utf-8')

      const usdResult = parseBankAccountCSV(usdContent, 'USDmovements.csv')
      const uyuResult = parseBankAccountCSV(uyuContent, 'UYUmovements.csv')

      // Both should have valid metadata
      expect(usdResult.metadata).toBeDefined()
      expect(uyuResult.metadata).toBeDefined()

      // Both should have transactions
      expect(usdResult.transactions.length).toBeGreaterThan(0)
      expect(uyuResult.transactions.length).toBeGreaterThan(0)

      // File types should be different
      expect(usdResult.fileType).toBe('bank_account_usd')
      expect(uyuResult.fileType).toBe('bank_account_uyu')

      // Currencies should be correct
      usdResult.transactions.forEach((tx) => {
        expect(tx.currency).toBe('USD')
      })
      uyuResult.transactions.forEach((tx) => {
        expect(tx.currency).toBe('UYU')
      })
    })
  })
})
