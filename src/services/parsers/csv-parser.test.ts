import { describe, it, expect } from 'vitest'
import { parseCSV, detectFileType } from './csv-parser'

// Sample CSV snippets for detection
const creditCardCSVSnippet = `Cliente,Número de tarjeta de crédito,Alias,Tipo de producto,Fecha de corte,Fecha de vencimiento,Límite de crédito (US$),Límite de crédito ($),
Gazzano Arismendi Jose,XXXXX-4362,Visa Soy Santander,Tarjeta de crédito,04/12/2025,22/12/2025,"0,00","270.000,00",`

const usdBankAccountCSVSnippet = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529538,
Moneda,USD,
Sucursal,02 - 18 De Julio,`

const uyuBankAccountCSVSnippet = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529520,
Moneda,UYU,
Sucursal,02 - 18 De Julio,`

// Full sample CSVs for parsing
const fullCreditCardCSV = `Cliente,Número de tarjeta de crédito,Alias,Tipo de producto,Fecha de corte,Fecha de vencimiento,Límite de crédito (US$),Límite de crédito ($),
Gazzano Arismendi Jose,XXXXX-4362,Visa Soy Santander,Tarjeta de crédito,04/12/2025,22/12/2025,"0,00","270.000,00",

Saldo del corte anterior (US$),Saldo del corte anterior ($),Pago mínimo (US$),Pago mínimo ($),Pago contado (US$),Pago contado ($),
"2.238,54","58.259,16","0,00","1.108,00","-593,71","20.428,95",

Monto vencido (US$),Monto vencido ($),
"0,00","0,00",

Período,
Desde:,01/12/2025,Hasta:,31/12/2025

Movimientos,
Fecha,Número de tarjeta,Número de autorización,Descripción,Importe original,Pesos,Dólares,
04/11/2025,XXXXX-4362,770025140510,Devoto Supermercado,"0,00","1.878,39","0,00",`

const fullUSDAccountCSV = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529538,
Moneda,USD,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
27/11/2025,598386,DEBITO OPERACION EN SUPERNET O SMS P--,,-174.65,,11749.61,`

const fullUYUAccountCSV = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529520,
Moneda,UYU,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
27/11/2025,000000,DEBITO OPERACION EN SUPERNET O SMS NRO FAMILIA                  5506,,-6820.00,,116.44,`

describe('CSV Parser - File Type Detection', () => {
  describe('detectFileType', () => {
    it('should detect credit card CSV from header', () => {
      const fileType = detectFileType(creditCardCSVSnippet)
      expect(fileType).toBe('credit_card')
    })

    it('should detect USD bank account CSV from metadata', () => {
      const fileType = detectFileType(usdBankAccountCSVSnippet)
      expect(fileType).toBe('bank_account_usd')
    })

    it('should detect UYU bank account CSV from metadata', () => {
      const fileType = detectFileType(uyuBankAccountCSVSnippet)
      expect(fileType).toBe('bank_account_uyu')
    })

    it('should detect credit card from full CSV', () => {
      const fileType = detectFileType(fullCreditCardCSV)
      expect(fileType).toBe('credit_card')
    })

    it('should detect USD account from full CSV', () => {
      const fileType = detectFileType(fullUSDAccountCSV)
      expect(fileType).toBe('bank_account_usd')
    })

    it('should detect UYU account from full CSV', () => {
      const fileType = detectFileType(fullUYUAccountCSV)
      expect(fileType).toBe('bank_account_uyu')
    })

    it('should throw error for unrecognized CSV format', () => {
      const unknownCSV = 'Random,Data,Here\n1,2,3\n'
      expect(() => detectFileType(unknownCSV)).toThrow(
        'Unable to detect CSV file type'
      )
    })
  })

  describe('parseCSV - Unified Parser', () => {
    it('should parse credit card CSV automatically', () => {
      const result = parseCSV(fullCreditCardCSV, 'test.csv')

      expect(result.fileType).toBe('credit_card')
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.fileName).toBe('test.csv')
    })

    it('should parse USD bank account CSV automatically', () => {
      const result = parseCSV(fullUSDAccountCSV, 'test.csv')

      expect(result.fileType).toBe('bank_account_usd')
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.transactions[0].currency).toBe('USD')
    })

    it('should parse UYU bank account CSV automatically', () => {
      const result = parseCSV(fullUYUAccountCSV, 'test.csv')

      expect(result.fileType).toBe('bank_account_uyu')
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(result.transactions[0].currency).toBe('UYU')
    })

    it('should route to credit card parser for credit card files', () => {
      const result = parseCSV(fullCreditCardCSV, 'CreditCard.csv')

      // Should have credit card metadata
      if ('numeroTarjeta' in result.metadata) {
        expect(result.metadata.numeroTarjeta).toBeTruthy()
        expect(result.metadata.alias).toBeTruthy()
      } else {
        throw new Error('Expected CreditCardMetadata')
      }
    })

    it('should route to bank account parser for USD files', () => {
      const result = parseCSV(fullUSDAccountCSV, 'USD.csv')

      // Should have bank account metadata
      if ('moneda' in result.metadata) {
        expect(result.metadata.moneda).toBe('USD')
        expect(result.metadata.cuenta).toBeTruthy()
      } else {
        throw new Error('Expected BankAccountMetadata')
      }
    })

    it('should route to bank account parser for UYU files', () => {
      const result = parseCSV(fullUYUAccountCSV, 'UYU.csv')

      // Should have bank account metadata
      if ('moneda' in result.metadata) {
        expect(result.metadata.moneda).toBe('UYU')
        expect(result.metadata.cuenta).toBeTruthy()
      } else {
        throw new Error('Expected BankAccountMetadata')
      }
    })

    it('should throw error for unrecognized CSV format', () => {
      const unknownCSV = 'Random,Data,Here\n1,2,3\n'
      expect(() => parseCSV(unknownCSV, 'unknown.csv')).toThrow()
    })

    it('should preserve original filename in result', () => {
      const result = parseCSV(fullCreditCardCSV, 'MyStatements.csv')
      expect(result.fileName).toBe('MyStatements.csv')
    })

    it('should return ParsedData with parsedAt timestamp', () => {
      const before = new Date()
      const result = parseCSV(fullCreditCardCSV, 'test.csv')
      const after = new Date()

      expect(result.parsedAt).toBeInstanceOf(Date)
      expect(result.parsedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(result.parsedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('should handle all three file types without errors', () => {
      const creditCardResult = parseCSV(fullCreditCardCSV, 'cc.csv')
      const usdResult = parseCSV(fullUSDAccountCSV, 'usd.csv')
      const uyuResult = parseCSV(fullUYUAccountCSV, 'uyu.csv')

      expect(creditCardResult.errors).toBeUndefined()
      expect(usdResult.errors).toBeUndefined()
      expect(uyuResult.errors).toBeUndefined()

      expect(creditCardResult.transactions.length).toBeGreaterThan(0)
      expect(usdResult.transactions.length).toBeGreaterThan(0)
      expect(uyuResult.transactions.length).toBeGreaterThan(0)
    })
  })
})
