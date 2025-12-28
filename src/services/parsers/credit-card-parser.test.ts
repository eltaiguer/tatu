import { describe, it, expect } from 'vitest'
import { parseCreditCardCSV } from './credit-card-parser'

// Sample CSV content from actual Santander credit card statement
const sampleCSV = `Cliente,Número de tarjeta de crédito,Alias,Tipo de producto,Fecha de corte,Fecha de vencimiento,Límite de crédito (US$),Límite de crédito ($),
Gazzano Arismendi Jose,XXXXX-4362,Visa Soy Santander,Tarjeta de crédito,04/12/2025,22/12/2025,"0,00","270.000,00",

Saldo del corte anterior (US$),Saldo del corte anterior ($),Pago mínimo (US$),Pago mínimo ($),Pago contado (US$),Pago contado ($),
"2.238,54","58.259,16","0,00","1.108,00","-593,71","20.428,95",

Monto vencido (US$),Monto vencido ($),
"0,00","0,00",

Período,
Desde:,01/12/2025,Hasta:,31/12/2025

Movimientos,
Fecha,Número de tarjeta,Número de autorización,Descripción,Importe original,Pesos,Dólares,
04/11/2025,XXXXX-4362,770025140510,Devoto Supermercado,"0,00","1.878,39","0,00",
07/11/2025,XXXXX-4362,770025140510,Jetbrains Americas Inc,"0,00","0,00","10,37",
06/11/2025,XXXXX-4362,770025140510,Pago Supernet,"0,00","0,00","-2.238,54",
06/11/2025,XXXXX-4362,770025140510,Pago Supernet,"-1.463,54","-58.259,16","0,00",
`

describe('Credit Card Parser', () => {
  describe('parseCreditCardCSV', () => {
    it('should parse valid credit card CSV and return ParsedData', () => {
      const result = parseCreditCardCSV(
        sampleCSV,
        'CreditCardsMovementsDetail.csv'
      )

      expect(result).toBeDefined()
      expect(result.fileType).toBe('credit_card')
      expect(result.fileName).toBe('CreditCardsMovementsDetail.csv')
      expect(result.parsedAt).toBeInstanceOf(Date)
    })

    it('should extract credit card metadata correctly', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')

      expect(result.metadata).toBeDefined()
      const metadata = result.metadata

      // Type guard to ensure it's CreditCardMetadata
      if ('numeroTarjeta' in metadata) {
        expect(metadata.cliente).toBe('Gazzano Arismendi Jose')
        expect(metadata.numeroTarjeta).toBe('XXXXX-4362')
        expect(metadata.alias).toBe('Visa Soy Santander')
        expect(metadata.tipoProducto).toBe('Tarjeta de crédito')
        expect(metadata.fechaCorte).toBe('04/12/2025')
        expect(metadata.fechaVencimiento).toBe('22/12/2025')
        expect(metadata.limiteCreditoUSD).toBe('0,00')
        expect(metadata.limiteCreditoUYU).toBe('270.000,00')
        expect(metadata.saldoAnteriorUSD).toBe('2.238,54')
        expect(metadata.saldoAnteriorUYU).toBe('58.259,16')
        expect(metadata.pagoMinimoUSD).toBe('0,00')
        expect(metadata.pagoMinimoUYU).toBe('1.108,00')
        expect(metadata.pagoContadoUSD).toBe('-593,71')
        expect(metadata.pagoContadoUYU).toBe('20.428,95')
        expect(metadata.montoVencidoUSD).toBe('0,00')
        expect(metadata.montoVencidoUYU).toBe('0,00')
        expect(metadata.periodoDesde).toBe('01/12/2025')
        expect(metadata.periodoHasta).toBe('31/12/2025')
      } else {
        throw new Error('Expected CreditCardMetadata')
      }
    })

    it('should parse all transactions from CSV', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')

      expect(result.transactions).toHaveLength(4)
    })

    it('should parse UYU transaction correctly', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')
      const devotoTx = result.transactions[0]

      expect(devotoTx.description).toBe('Devoto Supermercado')
      expect(devotoTx.amount).toBe(1878.39)
      expect(devotoTx.currency).toBe('UYU')
      expect(devotoTx.type).toBe('debit')
      expect(devotoTx.source).toBe('credit_card')
      expect(devotoTx.date).toBeInstanceOf(Date)
      expect(devotoTx.date.getDate()).toBe(4)
      expect(devotoTx.date.getMonth()).toBe(10) // November
      expect(devotoTx.date.getFullYear()).toBe(2025)
    })

    it('should parse USD transaction correctly', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')
      const jetbrainsTx = result.transactions[1]

      expect(jetbrainsTx.description).toBe('Jetbrains Americas Inc')
      expect(jetbrainsTx.amount).toBe(10.37)
      expect(jetbrainsTx.currency).toBe('USD')
      expect(jetbrainsTx.type).toBe('debit')
      expect(jetbrainsTx.source).toBe('credit_card')
    })

    it('should handle credit transactions (payments) with negative amounts as credits', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')
      const paymentTx1 = result.transactions[2]
      const paymentTx2 = result.transactions[3]

      // Payment in USD (negative = credit)
      expect(paymentTx1.description).toBe('Pago Supernet')
      expect(paymentTx1.amount).toBe(2238.54) // Absolute value
      expect(paymentTx1.currency).toBe('USD')
      expect(paymentTx1.type).toBe('credit')

      // Payment in UYU (negative = credit)
      expect(paymentTx2.description).toBe('Pago Supernet')
      expect(paymentTx2.amount).toBe(58259.16) // Absolute value
      expect(paymentTx2.currency).toBe('UYU')
      expect(paymentTx2.type).toBe('credit')
    })

    it('should generate unique IDs for each transaction', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')

      const ids = result.transactions.map((tx) => tx.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should preserve raw data in each transaction', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')
      const tx = result.transactions[0]

      expect(tx.rawData).toBeDefined()
      expect('fecha' in tx.rawData).toBe(true)
      expect('numeroTarjeta' in tx.rawData).toBe(true)
      expect('descripcion' in tx.rawData).toBe(true)
    })

    it('should handle CSV with no transactions', () => {
      const csvWithoutTransactions = `Cliente,Número de tarjeta de crédito,Alias,Tipo de producto,Fecha de corte,Fecha de vencimiento,Límite de crédito (US$),Límite de crédito ($),
Gazzano Arismendi Jose,XXXXX-4362,Visa Soy Santander,Tarjeta de crédito,04/12/2025,22/12/2025,"0,00","270.000,00",

Saldo del corte anterior (US$),Saldo del corte anterior ($),Pago mínimo (US$),Pago mínimo ($),Pago contado (US$),Pago contado ($),
"2.238,54","58.259,16","0,00","1.108,00","-593,71","20.428,95",

Monto vencido (US$),Monto vencido ($),
"0,00","0,00",

Período,
Desde:,01/12/2025,Hasta:,31/12/2025

Movimientos,
Fecha,Número de tarjeta,Número de autorización,Descripción,Importe original,Pesos,Dólares,`

      const result = parseCreditCardCSV(csvWithoutTransactions, 'test.csv')

      expect(result.transactions).toHaveLength(0)
    })

    it('should determine currency based on which field has non-zero value', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')

      // Transaction with only Pesos
      const uyuTx = result.transactions.find(
        (tx) => tx.description === 'Devoto Supermercado'
      )
      expect(uyuTx?.currency).toBe('UYU')

      // Transaction with only Dólares
      const usdTx = result.transactions.find(
        (tx) => tx.description === 'Jetbrains Americas Inc'
      )
      expect(usdTx?.currency).toBe('USD')
    })

    it('should handle multiple transactions on same date with different IDs', () => {
      const result = parseCreditCardCSV(sampleCSV, 'test.csv')

      // Find transactions on 06/11/2025
      const sameDateTxs = result.transactions.filter(
        (tx) => tx.date.getDate() === 6
      )

      expect(sameDateTxs.length).toBe(2)
      expect(sameDateTxs[0].id).not.toBe(sameDateTxs[1].id)
    })
  })
})
