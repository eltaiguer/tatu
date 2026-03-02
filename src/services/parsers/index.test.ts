import { describe, expect, it } from 'vitest'
import * as parsers from './index'
import { parseCSV, detectFileType } from './csv-parser'
import { parseCreditCardCSV } from './credit-card-parser'
import { parseBankAccountCSV } from './bank-account-parser'
import {
  parseSantanderNumber,
  parseSantanderDate,
  generateTransactionId,
} from './utils'

describe('parsers module index exports', () => {
  it('re-exports parser entry points', () => {
    expect(parsers.parseCSV).toBe(parseCSV)
    expect(parsers.detectFileType).toBe(detectFileType)
    expect(parsers.parseCreditCardCSV).toBe(parseCreditCardCSV)
    expect(parsers.parseBankAccountCSV).toBe(parseBankAccountCSV)
  })

  it('re-exports parser utility functions', () => {
    expect(parsers.parseSantanderNumber).toBe(parseSantanderNumber)
    expect(parsers.parseSantanderDate).toBe(parseSantanderDate)
    expect(parsers.generateTransactionId).toBe(generateTransactionId)
  })
})
