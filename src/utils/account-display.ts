import type { FileType } from '../models'

// The three Santander accounts, keyed like the statements they come from
// (`FileType`). One place for their names: the import summary, the Resumen
// account cards and the transaction rows all read them from here.

export const ACCOUNT_LABELS: Record<FileType, string> = {
  credit_card: 'Tarjeta de crédito',
  bank_account_usd: 'Cuenta USD',
  bank_account_uyu: 'Cuenta $U',
}

/** For compact rows, where the card is just "Tarjeta". */
export const ACCOUNT_SHORT_LABELS: Record<FileType, string> = {
  ...ACCOUNT_LABELS,
  credit_card: 'Tarjeta',
}

/**
 * Which account a row came from. A bank account is identified by its
 * currency (USD and $U are separate accounts).
 */
export function accountOf(source: string, currency: string): FileType {
  if (source === 'credit_card') return 'credit_card'
  return currency === 'USD' ? 'bank_account_usd' : 'bank_account_uyu'
}
