import { describe, it, expect } from 'vitest'
import { parseBankAccountCSV } from './bank-account-parser'

// Sample USD bank account CSV from Santander Uruguay
const sampleUSDCSV = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529538,
Moneda,USD,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
27/11/2025,598386,DEBITO OPERACION EN SUPERNET O SMS P--,,-174.65,,11749.61,
27/11/2025,TT55557465,TRANSFERENCIA ENVIADA 754934TT55557465 TRF. PLAZA- FEDERICO GAZZANO,,-1.90,,11924.26,
06/11/2025,7929,CR. PAGO SUELDOS 20251106_0610426 SETA WORKSHOP SRL,,,6104.26,14623.67,
04/11/2025,LR46465738,TRANSF INSTANTANEA RECIBIDA 644388LR:000022992325 GONZALEZ MAJO ROSINA,,,69.99,12221.49,
`

// Sample UYU bank account CSV from Santander Uruguay
const sampleUYUCSV = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529520,
Moneda,UYU,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
27/11/2025,000000,DEBITO OPERACION EN SUPERNET O SMS NRO FAMILIA                  5506,,-6820.00,,116.44,
27/11/2025,598386,CREDITO POR OPERACION EN SUPERNET P--/GAZZANO ARISMENDI JOSE,,,6820.00,6936.44,
25/11/2025,001075501044,"RETIRO CORRESPONSALES , MONTEVIDEO TARJ: ############9172",,-1500.00,,116.44,
24/11/2025,532500606784,"COMPRA CON TARJETA DEBITO PEDIDOSYA, MONTEVIDEO TARJ: ############9172",,-47.00,,339.92,
`

describe('Bank Account Parser', () => {
  describe('parseBankAccountCSV - USD Account', () => {
    it('should parse valid USD bank account CSV and return ParsedData', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      expect(result).toBeDefined()
      expect(result.fileType).toBe('bank_account_usd')
      expect(result.fileName).toBe('USDmovements.csv')
      expect(result.parsedAt).toBeInstanceOf(Date)
    })

    it('should extract USD bank account metadata correctly', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      expect(result.metadata).toBeDefined()
      const metadata = result.metadata

      if ('moneda' in metadata) {
        expect(metadata.cliente).toBe('Gazzano      A Jose')
        expect(metadata.cuenta).toBe('Ca De Ahorro Atm')
        expect(metadata.numero).toBe('007003529538')
        expect(metadata.moneda).toBe('USD')
        expect(metadata.sucursal).toBe('02 - 18 De Julio')
        expect(metadata.periodoDesde).toBe('01/11/2025')
        expect(metadata.periodoHasta).toBe('30/11/2025')
      } else {
        throw new Error('Expected BankAccountMetadata')
      }
    })

    it('should parse all USD transactions from CSV', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      expect(result.transactions).toHaveLength(4)
    })

    it('should parse USD debit transaction correctly', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')
      const debitTx = result.transactions[0]

      expect(debitTx.description).toContain('DEBITO OPERACION EN SUPERNET')
      expect(debitTx.amount).toBe(174.65)
      expect(debitTx.currency).toBe('USD')
      expect(debitTx.type).toBe('debit')
      expect(debitTx.source).toBe('bank_account')
      expect(debitTx.balance).toBe(11749.61)
      expect(debitTx.date).toBeInstanceOf(Date)
      expect(debitTx.date.getDate()).toBe(27)
      expect(debitTx.date.getMonth()).toBe(10) // November
    })

    it('should parse USD credit transaction correctly', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')
      const creditTx = result.transactions[2]

      expect(creditTx.description).toContain('CR. PAGO SUELDOS')
      expect(creditTx.amount).toBe(6104.26)
      expect(creditTx.currency).toBe('USD')
      expect(creditTx.type).toBe('credit')
      expect(creditTx.source).toBe('bank_account')
      expect(creditTx.balance).toBe(14623.67)
    })

    it('should include balance for all USD transactions', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      result.transactions.forEach((tx) => {
        expect(tx.balance).toBeDefined()
        expect(typeof tx.balance).toBe('number')
        expect(tx.balance).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('parseBankAccountCSV - UYU Account', () => {
    it('should parse valid UYU bank account CSV and return ParsedData', () => {
      const result = parseBankAccountCSV(sampleUYUCSV, 'UYUmovements.csv')

      expect(result).toBeDefined()
      expect(result.fileType).toBe('bank_account_uyu')
      expect(result.fileName).toBe('UYUmovements.csv')
    })

    it('should extract UYU bank account metadata correctly', () => {
      const result = parseBankAccountCSV(sampleUYUCSV, 'UYUmovements.csv')

      const metadata = result.metadata

      if ('moneda' in metadata) {
        expect(metadata.cliente).toBe('Gazzano      A Jose')
        expect(metadata.moneda).toBe('UYU')
        expect(metadata.numero).toBe('007003529520')
      } else {
        throw new Error('Expected BankAccountMetadata')
      }
    })

    it('should parse all UYU transactions from CSV', () => {
      const result = parseBankAccountCSV(sampleUYUCSV, 'UYUmovements.csv')

      expect(result.transactions).toHaveLength(4)
    })

    it('should parse UYU debit transaction correctly', () => {
      const result = parseBankAccountCSV(sampleUYUCSV, 'UYUmovements.csv')
      const debitTx = result.transactions[0]

      expect(debitTx.amount).toBe(6820.0)
      expect(debitTx.currency).toBe('UYU')
      expect(debitTx.type).toBe('debit')
      expect(debitTx.source).toBe('bank_account')
      expect(debitTx.balance).toBe(116.44)
    })

    it('should parse UYU credit transaction correctly', () => {
      const result = parseBankAccountCSV(sampleUYUCSV, 'UYUmovements.csv')
      const creditTx = result.transactions[1]

      expect(creditTx.amount).toBe(6820.0)
      expect(creditTx.currency).toBe('UYU')
      expect(creditTx.type).toBe('credit')
      expect(creditTx.balance).toBe(6936.44)
    })
  })

  describe('parseBankAccountCSV - Transaction Details', () => {
    it('should generate unique IDs for each transaction', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      const ids = result.transactions.map((tx) => tx.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it('should preserve raw data in each transaction', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')
      const tx = result.transactions[0]

      expect(tx.rawData).toBeDefined()
      expect('fecha' in tx.rawData).toBe(true)
      expect('referencia' in tx.rawData).toBe(true)
      expect('concepto' in tx.rawData).toBe(true)
      expect('descripcion' in tx.rawData).toBe(true)
      expect('debito' in tx.rawData).toBe(true)
      expect('credito' in tx.rawData).toBe(true)
      expect('saldos' in tx.rawData).toBe(true)
    })

    it('should combine concepto and descripcion for transaction description', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')
      const tx = result.transactions[0]

      // Should combine both concepto and descripcion
      expect(tx.description).toContain('DEBITO OPERACION EN SUPERNET')
    })

    it('should handle transactions with empty description', () => {
      const csvWithEmptyDesc = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529538,
Moneda,USD,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
27/11/2025,598386,DEBITO OPERACION EN SUPERNET,,-174.65,,11749.61,`

      const result = parseBankAccountCSV(csvWithEmptyDesc, 'test.csv')

      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].description).toBe(
        'DEBITO OPERACION EN SUPERNET'
      )
    })

    it('should handle CSV with no transactions', () => {
      const csvWithoutTransactions = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529538,
Moneda,USD,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,`

      const result = parseBankAccountCSV(csvWithoutTransactions, 'test.csv')

      expect(result.transactions).toHaveLength(0)
    })

    it('should determine transaction type based on debito/credito columns', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      // First transaction has debito
      expect(result.transactions[0].type).toBe('debit')

      // Third transaction has credito
      expect(result.transactions[2].type).toBe('credit')
    })

    it('should handle large numbers correctly', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')
      const largeTx = result.transactions[2] // Salary payment

      expect(largeTx.amount).toBe(6104.26)
      expect(largeTx.balance).toBe(14623.67)
    })

    it('should parse decimal numbers in US format', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      // Check that all amounts are parsed correctly
      expect(result.transactions[0].amount).toBe(174.65)
      expect(result.transactions[1].amount).toBe(1.9)
      expect(result.transactions[3].amount).toBe(69.99)
    })

    it('should handle multiple transactions on same date', () => {
      const result = parseBankAccountCSV(sampleUSDCSV, 'USDmovements.csv')

      // Find transactions on 27/11/2025
      const sameDateTxs = result.transactions.filter(
        (tx) => tx.date.getDate() === 27
      )

      expect(sameDateTxs.length).toBe(2)
      expect(sameDateTxs[0].id).not.toBe(sameDateTxs[1].id)
    })
  })
})
