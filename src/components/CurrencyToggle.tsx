import type { Currency } from '../models'
import { SegmentedToggle } from './ui/segmented-toggle'

const CURRENCY_OPTIONS: { label: string; value: Currency }[] = [
  { label: 'US$', value: 'USD' },
  { label: '$U', value: 'UYU' },
]

interface CurrencyToggleProps {
  value: Currency
  onChange: (c: Currency) => void
}

export function CurrencyToggle({ value, onChange }: CurrencyToggleProps) {
  return (
    <SegmentedToggle
      options={CURRENCY_OPTIONS}
      value={value}
      onChange={onChange}
      aria-label="Moneda principal"
    />
  )
}
