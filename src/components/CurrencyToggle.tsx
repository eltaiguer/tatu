import type { Currency } from '../models'
import { SegmentedToggle } from './ui/segmented-toggle'

const CURRENCY_OPTIONS: { label: string; value: Currency }[] = [
  { label: 'US$', value: 'USD' },
  { label: '$U', value: 'UYU' },
]

interface CurrencyToggleProps {
  value: Currency
  onChange: (c: Currency) => void
  size?: 'sm' | 'md'
}

export function CurrencyToggle({
  value,
  onChange,
  size = 'md',
}: CurrencyToggleProps) {
  return (
    <SegmentedToggle
      options={CURRENCY_OPTIONS}
      value={value}
      onChange={onChange}
      size={size}
      aria-label="Moneda principal"
    />
  )
}
