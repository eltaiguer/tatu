import { useId, useRef, useState } from 'react'
import { Eye, EyeOff, Filter } from 'lucide-react'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../ui/utils'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { filterControlClass } from './filter-control-class'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { SegmentedToggle } from '../ui/segmented-toggle'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import type { FilterPatch } from '../../services/filters/transaction-filter'
import type { UrlFilterState } from '../../services/filters/url-filters'
import {
  ACCOUNT_OPTIONS,
  SECONDARY_FILTERS_CLEARED,
  typePatch,
} from './secondary-filters'

const SECTION_LABEL =
  'text-xs font-medium text-muted-foreground uppercase tracking-wider'

function PanelBody({
  filters,
  ignoredCount,
  activeCount,
  onChange,
}: {
  filters: UrlFilterState
  ignoredCount: number
  activeCount: number
  onChange: (patch: FilterPatch) => void
}) {
  const accountLabelId = useId()
  const bodyRef = useRef<HTMLDivElement>(null)
  const minId = useId()
  const maxId = useId()
  const { accounts, type, currency, min, max, showIgnored } = filters
  return (
    <div
      ref={bodyRef}
      tabIndex={-1}
      className="flex flex-col gap-4 outline-none"
    >
      <div className="flex flex-col gap-2">
        <span id={accountLabelId} className={SECTION_LABEL}>
          Cuenta
        </span>
        <div
          role="group"
          aria-labelledby={accountLabelId}
          className="flex flex-wrap gap-x-4 gap-y-2"
        >
          {ACCOUNT_OPTIONS.map((o) => {
            const id = `${accountLabelId}-${o.value}`
            return (
              <div key={o.value} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={accounts.includes(o.value)}
                  onCheckedChange={() =>
                    onChange({
                      accounts: accounts.includes(o.value)
                        ? accounts.filter((a) => a !== o.value)
                        : [...accounts, o.value],
                    })
                  }
                />
                <label htmlFor={id} className="text-sm">
                  {o.label}
                </label>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>Tipo</span>
        {/* Income has no household answer, so the two never combine: the
            latest pick wins (here and in the Hogar chip). */}
        <SegmentedToggle
          options={[
            { value: 'all' as const, label: 'Ambos' },
            { value: 'credit' as const, label: 'Ingresos' },
            { value: 'debit' as const, label: 'Gastos' },
          ]}
          value={type}
          onChange={(next) => onChange(typePatch(filters, next))}
          size="sm"
          aria-label="Tipo de transacción"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>Moneda</span>
        <SegmentedToggle
          options={[
            { value: 'all' as const, label: 'Ambas' },
            { value: 'UYU' as const, label: '$U' },
            { value: 'USD' as const, label: 'US$' },
          ]}
          value={currency}
          onChange={(next) => onChange({ currency: next })}
          size="sm"
          aria-label="Moneda"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className={SECTION_LABEL}>Monto</span>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={minId} className="mb-1 block text-sm">
              Monto mínimo
            </label>
            <Input
              id={minId}
              type="number"
              placeholder="0"
              value={min}
              onChange={(e) => onChange({ min: e.target.value })}
              className="text-[13px]!"
            />
          </div>
          <div>
            <label htmlFor={maxId} className="mb-1 block text-sm">
              Monto máximo
            </label>
            <Input
              id={maxId}
              type="number"
              placeholder="∞"
              value={max}
              onChange={(e) => onChange({ max: e.target.value })}
              className="text-[13px]!"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange({ showIgnored: !showIgnored })}
        aria-pressed={showIgnored}
        disabled={ignoredCount === 0}
        title="Los movimientos ignorados no cuentan en los totales"
        className={cn(
          'inline-flex h-[32px] items-center gap-[6px] self-start rounded-[8px] border bg-transparent px-[10px] py-0 text-[13px] font-medium',
          showIgnored
            ? 'border-[var(--brand)] text-[color:var(--brand-text,var(--brand))]'
            : 'border-[var(--border)] text-[color:var(--text-muted)]',
          ignoredCount === 0
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer opacity-100'
        )}
      >
        {showIgnored ? (
          <Eye size={14} aria-hidden="true" />
        ) : (
          <EyeOff size={14} aria-hidden="true" />
        )}
        {ignoredCount === 0
          ? 'Sin movimientos ignorados'
          : `${showIgnored ? 'Ocultar' : 'Mostrar'} movimientos ignorados`}
        {ignoredCount > 0 && (
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-[color:var(--text-muted)]">
            · {ignoredCount}
          </span>
        )}
      </button>

      <div className="flex justify-end border-t border-[var(--border)] pt-3">
        {/* Only the panel's own filters: search, Categoría, Hogar, A
              revisar and the period stay. */}
        <button
          type="button"
          disabled={activeCount === 0}
          onClick={() => {
            onChange(SECONDARY_FILTERS_CLEARED)
            // The button goes disabled: keep focus in the panel.
            bodyRef.current?.focus()
          }}
          className="cursor-pointer border-none [background:none] px-[4px] py-0 text-[13px] font-[500] text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}

// The filters beyond the bar's primary row: a popover from md (where the
// table replaces the cards), a bottom sheet below it..
export function FiltersPanel({
  filters,
  ignoredCount,
  activeCount,
  onChange,
}: {
  filters: UrlFilterState
  ignoredCount: number
  // How many secondary filters are active: the N of "Filtros (N)".
  activeCount: number
  onChange: (patch: FilterPatch) => void
}) {
  // Followed, not read once: crossing 768px with the panel open swaps the
  // variant, and `open` lives here so the swap keeps it open.
  const wide = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const trigger = (
    <button type="button" className={filterControlClass(activeCount > 0)}>
      <Filter size={14} aria-hidden="true" />
      {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'}
    </button>
  )
  const body = (
    <PanelBody
      filters={filters}
      ignoredCount={ignoredCount}
      activeCount={activeCount}
      onChange={onChange}
    />
  )

  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" aria-label="Filtros" className="w-80">
          {body}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Los cambios se aplican al instante.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  )
}
