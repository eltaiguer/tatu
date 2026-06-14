import type { Currency } from '../../models'

// rate: 1 USD = rate UYU (e.g., 40.5 means 1 USD = 40.5 UYU)
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rate: number
): number {
  if (from === to) return amount
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('FX rate must be a positive finite number')
  }
  return from === 'USD' ? amount * rate : amount / rate
}
