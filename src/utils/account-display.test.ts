import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_LABELS,
  ACCOUNT_SHORT_LABELS,
  accountOf,
} from './account-display'

// The three Santander accounts, named the same everywhere (copy guide,
// docs/CONTEXT.md): the import summary, the Resumen account cards and the
// transaction rows.
describe('account display', () => {
  it('names each account as the copy guide does', () => {
    expect(ACCOUNT_LABELS).toEqual({
      credit_card: 'Tarjeta de crédito',
      bank_account_usd: 'Cuenta USD',
      bank_account_uyu: 'Cuenta $U',
    })
  })

  it('shortens only the card in compact rows', () => {
    expect(ACCOUNT_SHORT_LABELS).toEqual({
      credit_card: 'Tarjeta',
      bank_account_usd: 'Cuenta USD',
      bank_account_uyu: 'Cuenta $U',
    })
  })

  it("tells a row's account from its source, and a bank account by currency", () => {
    expect(accountOf('credit_card', 'USD')).toBe('credit_card')
    expect(accountOf('credit_card', 'UYU')).toBe('credit_card')
    expect(accountOf('bank_account', 'USD')).toBe('bank_account_usd')
    expect(accountOf('bank_account', 'UYU')).toBe('bank_account_uyu')
  })
})
