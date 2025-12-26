import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseCreditCardCSV } from './credit-card-parser'

describe('Credit Card Parser - Integration Tests with Real Sample', () => {
  it('should parse the actual CreditCardsMovementsDetail.csv sample file', () => {
    // Read the actual sample file
    const samplePath = join(
      process.cwd(),
      'samples',
      'CreditCardsMovementsDetail.csv'
    )
    const csvContent = readFileSync(samplePath, 'utf-8')

    const result = parseCreditCardCSV(csvContent, 'CreditCardsMovementsDetail.csv')

    // Verify basic structure
    expect(result.fileType).toBe('credit_card')
    expect(result.transactions.length).toBeGreaterThan(0)

    // Verify metadata was extracted
    const metadata = result.metadata
    if ('numeroTarjeta' in metadata) {
      expect(metadata.cliente).toBeTruthy()
      expect(metadata.numeroTarjeta).toContain('XXXXX')
      expect(metadata.periodoDesde).toBeTruthy()
      expect(metadata.periodoHasta).toBeTruthy()
    }

    // Verify all transactions have required fields
    result.transactions.forEach((tx) => {
      expect(tx.id).toBeTruthy()
      expect(tx.date).toBeInstanceOf(Date)
      expect(tx.description).toBeTruthy()
      expect(tx.amount).toBeGreaterThanOrEqual(0)
      expect(['USD', 'UYU']).toContain(tx.currency)
      expect(['debit', 'credit']).toContain(tx.type)
      expect(tx.source).toBe('credit_card')
      expect(tx.rawData).toBeDefined()
    })

    // Check for expected merchants in the sample
    const descriptions = result.transactions.map((tx) => tx.description)
    expect(descriptions.some((d) => d.includes('Devoto'))).toBe(true)
    expect(descriptions.some((d) => d.includes('Jetbrains'))).toBe(true)

    // Check for both USD and UYU transactions
    const currencies = new Set(result.transactions.map((tx) => tx.currency))
    expect(currencies.has('USD')).toBe(true)
    expect(currencies.has('UYU')).toBe(true)

    // Check for both debit and credit transactions
    const types = new Set(result.transactions.map((tx) => tx.type))
    expect(types.has('debit')).toBe(true)
    expect(types.has('credit')).toBe(true)
  })

  it('should handle all transactions without errors', () => {
    const samplePath = join(
      process.cwd(),
      'samples',
      'CreditCardsMovementsDetail.csv'
    )
    const csvContent = readFileSync(samplePath, 'utf-8')

    const result = parseCreditCardCSV(csvContent, 'CreditCardsMovementsDetail.csv')

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

  it('should correctly identify known merchants', () => {
    const samplePath = join(
      process.cwd(),
      'samples',
      'CreditCardsMovementsDetail.csv'
    )
    const csvContent = readFileSync(samplePath, 'utf-8')

    const result = parseCreditCardCSV(csvContent, 'CreditCardsMovementsDetail.csv')

    // Find some known merchants from the sample
    const devoto = result.transactions.find((tx) =>
      tx.description.includes('Devoto')
    )
    expect(devoto).toBeDefined()
    expect(devoto?.currency).toBe('UYU')
    expect(devoto?.type).toBe('debit')

    const jetbrains = result.transactions.find((tx) =>
      tx.description.includes('Jetbrains')
    )
    expect(jetbrains).toBeDefined()
    expect(jetbrains?.currency).toBe('USD')
    expect(jetbrains?.type).toBe('debit')

    // Find payment transactions
    const payment = result.transactions.find(
      (tx) => tx.description.includes('Pago') && tx.type === 'credit'
    )
    expect(payment).toBeDefined()
  })
})
