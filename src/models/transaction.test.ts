import { describe, it, expect } from 'vitest'
import type {
  Transaction,
  CreditCardTransaction,
  BankAccountTransaction,
  Currency,
  TransactionType,
} from './transaction'

describe('Transaction Models', () => {
  describe('Currency type', () => {
    it('should allow USD currency', () => {
      const currency: Currency = 'USD'
      expect(currency).toBe('USD')
    })

    it('should allow UYU currency', () => {
      const currency: Currency = 'UYU'
      expect(currency).toBe('UYU')
    })
  })

  describe('TransactionType', () => {
    it('should allow debit type', () => {
      const type: TransactionType = 'debit'
      expect(type).toBe('debit')
    })

    it('should allow credit type', () => {
      const type: TransactionType = 'credit'
      expect(type).toBe('credit')
    })
  })

  describe('Transaction interface', () => {
    it('should create a valid transaction object', () => {
      const transaction: Transaction = {
        id: '1',
        date: new Date('2025-11-04'),
        description: 'Devoto Supermercado',
        amount: 1878.39,
        currency: 'UYU',
        type: 'debit',
        source: 'credit_card',
        rawData: {},
      }

      expect(transaction.id).toBe('1')
      expect(transaction.date).toBeInstanceOf(Date)
      expect(transaction.description).toBe('Devoto Supermercado')
      expect(transaction.amount).toBe(1878.39)
      expect(transaction.currency).toBe('UYU')
      expect(transaction.type).toBe('debit')
      expect(transaction.source).toBe('credit_card')
    })

    it('should allow optional category field', () => {
      const transaction: Transaction = {
        id: '2',
        date: new Date('2025-11-07'),
        description: 'Jetbrains Americas Inc',
        amount: 10.37,
        currency: 'USD',
        type: 'debit',
        source: 'credit_card',
        category: 'Software',
        rawData: {},
      }

      expect(transaction.category).toBe('Software')
    })

    it('should allow optional balance field', () => {
      const transaction: Transaction = {
        id: '3',
        date: new Date('2025-11-27'),
        description: 'Transfer received',
        amount: 6104.26,
        currency: 'USD',
        type: 'credit',
        source: 'bank_account',
        balance: 14623.67,
        rawData: {},
      }

      expect(transaction.balance).toBe(14623.67)
    })
  })

  describe('CreditCardTransaction interface', () => {
    it('should create a valid credit card transaction from Santander format', () => {
      const ccTransaction: CreditCardTransaction = {
        fecha: '04/11/2025',
        numeroTarjeta: 'XXXXX-4362',
        numeroAutorizacion: '770025140510',
        descripcion: 'Devoto Supermercado',
        importeOriginal: '0,00',
        pesos: '1.878,39',
        dolares: '0,00',
      }

      expect(ccTransaction.fecha).toBe('04/11/2025')
      expect(ccTransaction.numeroTarjeta).toBe('XXXXX-4362')
      expect(ccTransaction.descripcion).toBe('Devoto Supermercado')
      expect(ccTransaction.pesos).toBe('1.878,39')
    })

    it('should handle transactions with USD amounts', () => {
      const ccTransaction: CreditCardTransaction = {
        fecha: '07/11/2025',
        numeroTarjeta: 'XXXXX-4362',
        numeroAutorizacion: '770025140510',
        descripcion: 'Jetbrains Americas Inc',
        importeOriginal: '0,00',
        pesos: '0,00',
        dolares: '10,37',
      }

      expect(ccTransaction.dolares).toBe('10,37')
      expect(ccTransaction.pesos).toBe('0,00')
    })

    it('should handle payment transactions with negative amounts', () => {
      const ccTransaction: CreditCardTransaction = {
        fecha: '06/11/2025',
        numeroTarjeta: 'XXXXX-4362',
        numeroAutorizacion: '770025140510',
        descripcion: 'Pago Supernet',
        importeOriginal: '-1.463,54',
        pesos: '-58.259,16',
        dolares: '0,00',
      }

      expect(ccTransaction.importeOriginal).toBe('-1.463,54')
      expect(ccTransaction.pesos).toBe('-58.259,16')
    })
  })

  describe('BankAccountTransaction interface', () => {
    it('should create a valid bank account transaction from Santander format', () => {
      const bankTransaction: BankAccountTransaction = {
        fecha: '27/11/2025',
        referencia: '598386',
        concepto: 'DEBITO OPERACION EN SUPERNET O SMS',
        descripcion: 'P--',
        debito: '174.65',
        credito: '',
        saldos: '11749.61',
      }

      expect(bankTransaction.fecha).toBe('27/11/2025')
      expect(bankTransaction.referencia).toBe('598386')
      expect(bankTransaction.debito).toBe('174.65')
      expect(bankTransaction.saldos).toBe('11749.61')
    })

    it('should handle credit transactions', () => {
      const bankTransaction: BankAccountTransaction = {
        fecha: '06/11/2025',
        referencia: '7929',
        concepto: 'CR. PAGO SUELDOS',
        descripcion: '20251106_0610426 SETA WORKSHOP SRL',
        debito: '',
        credito: '6104.26',
        saldos: '14623.67',
      }

      expect(bankTransaction.credito).toBe('6104.26')
      expect(bankTransaction.debito).toBe('')
    })

    it('should handle transactions with empty card number', () => {
      const bankTransaction: BankAccountTransaction = {
        fecha: '04/12/2025',
        referencia: '',
        concepto: 'Seguro Saldo Deudor',
        descripcion: '',
        debito: '91.39',
        credito: '',
        saldos: '',
      }

      expect(bankTransaction.referencia).toBe('')
    })
  })
})
