import { describe, it, expect } from 'vitest'
import type {
  ParsedData,
  CreditCardMetadata,
  BankAccountMetadata,
  FileType,
} from './parsed-data'
import type { Transaction } from './transaction'

describe('ParsedData Models', () => {
  describe('FileType', () => {
    it('should allow credit_card file type', () => {
      const fileType: FileType = 'credit_card'
      expect(fileType).toBe('credit_card')
    })

    it('should allow bank_account_usd file type', () => {
      const fileType: FileType = 'bank_account_usd'
      expect(fileType).toBe('bank_account_usd')
    })

    it('should allow bank_account_uyu file type', () => {
      const fileType: FileType = 'bank_account_uyu'
      expect(fileType).toBe('bank_account_uyu')
    })
  })

  describe('CreditCardMetadata', () => {
    it('should create valid credit card metadata from Santander format', () => {
      const metadata: CreditCardMetadata = {
        cliente: 'Gazzano Arismendi Jose',
        numeroTarjeta: 'XXXXX-4362',
        alias: 'Visa Soy Santander',
        tipoProducto: 'Tarjeta de crédito',
        fechaCorte: '04/12/2025',
        fechaVencimiento: '22/12/2025',
        limiteCreditoUSD: '0,00',
        limiteCreditoUYU: '270.000,00',
        saldoAnteriorUSD: '2.238,54',
        saldoAnteriorUYU: '58.259,16',
        pagoMinimoUSD: '0,00',
        pagoMinimoUYU: '1.108,00',
        pagoContadoUSD: '-593,71',
        pagoContadoUYU: '20.428,95',
        montoVencidoUSD: '0,00',
        montoVencidoUYU: '0,00',
        periodoDesde: '01/12/2025',
        periodoHasta: '31/12/2025',
      }

      expect(metadata.cliente).toBe('Gazzano Arismendi Jose')
      expect(metadata.numeroTarjeta).toBe('XXXXX-4362')
      expect(metadata.limiteCreditoUYU).toBe('270.000,00')
    })
  })

  describe('BankAccountMetadata', () => {
    it('should create valid USD bank account metadata from Santander format', () => {
      const metadata: BankAccountMetadata = {
        cliente: 'Gazzano      A Jose',
        cuenta: 'Ca De Ahorro Atm',
        numero: '007003529538',
        moneda: 'USD',
        sucursal: '02 - 18 De Julio',
        periodoDesde: '01/11/2025',
        periodoHasta: '30/11/2025',
      }

      expect(metadata.cliente).toBe('Gazzano      A Jose')
      expect(metadata.moneda).toBe('USD')
      expect(metadata.numero).toBe('007003529538')
    })

    it('should create valid UYU bank account metadata from Santander format', () => {
      const metadata: BankAccountMetadata = {
        cliente: 'Gazzano      A Jose',
        cuenta: 'Ca De Ahorro Atm',
        numero: '007003529520',
        moneda: 'UYU',
        sucursal: '02 - 18 De Julio',
        periodoDesde: '01/11/2025',
        periodoHasta: '30/11/2025',
      }

      expect(metadata.moneda).toBe('UYU')
    })
  })

  describe('ParsedData interface', () => {
    it('should create valid parsed data for credit card file', () => {
      const transaction: Transaction = {
        id: '1',
        date: new Date('2025-11-04'),
        description: 'Devoto Supermercado',
        amount: 1878.39,
        currency: 'UYU',
        type: 'debit',
        source: 'credit_card',
        rawData: {
          fecha: '04/11/2025',
          numeroTarjeta: 'XXXXX-4362',
          numeroAutorizacion: '770025140510',
          descripcion: 'Devoto Supermercado',
          importeOriginal: '0,00',
          pesos: '1.878,39',
          dolares: '0,00',
        },
      }

      const parsedData: ParsedData = {
        fileType: 'credit_card',
        transactions: [transaction],
        metadata: {
          cliente: 'Gazzano Arismendi Jose',
          numeroTarjeta: 'XXXXX-4362',
          alias: 'Visa Soy Santander',
          tipoProducto: 'Tarjeta de crédito',
          fechaCorte: '04/12/2025',
          fechaVencimiento: '22/12/2025',
          limiteCreditoUSD: '0,00',
          limiteCreditoUYU: '270.000,00',
          saldoAnteriorUSD: '2.238,54',
          saldoAnteriorUYU: '58.259,16',
          pagoMinimoUSD: '0,00',
          pagoMinimoUYU: '1.108,00',
          pagoContadoUSD: '-593,71',
          pagoContadoUYU: '20.428,95',
          montoVencidoUSD: '0,00',
          montoVencidoUYU: '0,00',
          periodoDesde: '01/12/2025',
          periodoHasta: '31/12/2025',
        },
        fileName: 'CreditCardsMovementsDetail.csv',
        parsedAt: new Date(),
      }

      expect(parsedData.fileType).toBe('credit_card')
      expect(parsedData.transactions).toHaveLength(1)
      expect(parsedData.transactions[0].description).toBe('Devoto Supermercado')
      expect(parsedData.fileName).toBe('CreditCardsMovementsDetail.csv')
      expect(parsedData.parsedAt).toBeInstanceOf(Date)
    })

    it('should create valid parsed data for USD bank account file', () => {
      const transaction: Transaction = {
        id: '1',
        date: new Date('2025-11-27'),
        description: 'DEBITO OPERACION EN SUPERNET O SMS P--',
        amount: 174.65,
        currency: 'USD',
        type: 'debit',
        source: 'bank_account',
        balance: 11749.61,
        rawData: {
          fecha: '27/11/2025',
          referencia: '598386',
          concepto: 'DEBITO OPERACION EN SUPERNET O SMS',
          descripcion: 'P--',
          debito: '174.65',
          credito: '',
          saldos: '11749.61',
        },
      }

      const parsedData: ParsedData = {
        fileType: 'bank_account_usd',
        transactions: [transaction],
        metadata: {
          cliente: 'Gazzano      A Jose',
          cuenta: 'Ca De Ahorro Atm',
          numero: '007003529538',
          moneda: 'USD',
          sucursal: '02 - 18 De Julio',
          periodoDesde: '01/11/2025',
          periodoHasta: '30/11/2025',
        },
        fileName: 'USDmovements.csv',
        parsedAt: new Date(),
      }

      expect(parsedData.fileType).toBe('bank_account_usd')
      if ('moneda' in parsedData.metadata) {
        expect(parsedData.metadata.moneda).toBe('USD')
      }
    })

    it('should handle multiple transactions', () => {
      const parsedData: ParsedData = {
        fileType: 'credit_card',
        transactions: [
          {
            id: '1',
            date: new Date('2025-11-04'),
            description: 'Devoto',
            amount: 100,
            currency: 'UYU',
            type: 'debit',
            source: 'credit_card',
            rawData: {},
          },
          {
            id: '2',
            date: new Date('2025-11-05'),
            description: 'Jetbrains',
            amount: 10.37,
            currency: 'USD',
            type: 'debit',
            source: 'credit_card',
            rawData: {},
          },
        ],
        metadata: {} as CreditCardMetadata,
        fileName: 'test.csv',
        parsedAt: new Date(),
      }

      expect(parsedData.transactions).toHaveLength(2)
    })

    it('should allow optional errors field', () => {
      const parsedData: ParsedData = {
        fileType: 'credit_card',
        transactions: [],
        metadata: {} as CreditCardMetadata,
        fileName: 'test.csv',
        parsedAt: new Date(),
        errors: ['Failed to parse line 10', 'Invalid date format on line 15'],
      }

      expect(parsedData.errors).toHaveLength(2)
      expect(parsedData.errors?.[0]).toBe('Failed to parse line 10')
    })
  })
})
