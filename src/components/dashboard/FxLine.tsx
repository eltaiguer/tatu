import type { Currency } from '../../models'
import { CurrencyToggle } from '../CurrencyToggle'
import { FxChip } from '../FxChip'

interface FxLineProps {
  fxRate: number
  homeCurrency: Currency
  onSetFxRate?: (r: number) => void
  onSetHomeCurrency?: (c: Currency) => void
}

// The first quiet line under the month hero: the exchange rate (editable) and
// the home-currency switch. Read-only, with no switch, when nothing can write.
export function FxLine({
  fxRate,
  homeCurrency,
  onSetFxRate,
  onSetHomeCurrency,
}: FxLineProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
      <span>Tipo de cambio:</span>{' '}
      <FxChip fxRate={fxRate} onSetFxRate={onSetFxRate} />
      {onSetHomeCurrency && (
        <CurrencyToggle
          value={homeCurrency}
          onChange={onSetHomeCurrency}
          size="sm"
        />
      )}
    </div>
  )
}
