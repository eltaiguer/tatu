import { useId, useRef, useState } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from './ui/utils'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { SegmentedToggle } from './ui/segmented-toggle'
import { getCategoryDisplay } from '../utils/category-display'
import { useClickOutside } from '../hooks/useClickOutside'

const ACCOUNT_OPTIONS = [
  { value: 'credit_card', label: 'Tarjeta' },
  { value: 'bank_account', label: 'Cuenta bancaria' },
]

interface MultiSelectPopoverProps {
  label: string
  options: { value: string; label: string; color?: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  ariaLabel?: string
}

function MultiSelectPopover({
  label,
  options,
  selected,
  onChange,
  ariaLabel,
}: MultiSelectPopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  const isActive = selected.length > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'bg-input-background focus-visible:ring-ring/50 inline-flex h-9 min-w-[120px] items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]',
          isActive
            ? 'border-[var(--brand)] text-[var(--brand-text,var(--brand))]'
            : 'border-input focus-visible:border-ring'
        )}
      >
        <span>
          {label}
          {isActive && (
            <span className="ml-[4px] font-[family-name:var(--font-mono)] text-[11px]">
              · {selected.length}
            </span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground ml-auto shrink-0"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="card absolute top-[calc(100%+6px)] left-0 z-30 max-h-[320px] min-w-[220px] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-[6px] shadow-[var(--shadow-lg)]">
          {options.map((o) => {
            const isSel = selected.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className="flex w-full cursor-pointer items-center gap-[9px] rounded-[7px] border-none bg-transparent px-[9px] py-[7px] text-left [font:inherit] text-[var(--text)]"
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    'var(--muted)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background =
                    'transparent')
                }
              >
                <span
                  className={cn(
                    'grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[4px] border-2 border-solid',
                    isSel
                      ? 'border-[var(--brand)] bg-[var(--brand)]'
                      : 'border-[var(--border)] bg-transparent'
                  )}
                >
                  {isSel && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--primary-foreground)"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {o.color && (
                  <span
                    className="h-[8px] w-[8px] shrink-0 rounded-[3px]"
                    style={{ background: o.color }}
                  />
                )}
                <span className="text-[14px]">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface TransactionFiltersProps {
  searchTerm: string
  dateFromFilter: string
  dateToFilter: string
  categoryFilters: string[]
  accountFilters: string[]
  currencyFilter: 'all' | 'USD' | 'UYU'
  typeFilter: 'all' | 'credit' | 'debit'
  minAmount: string
  maxAmount: string
  availableCategories: string[]
  hasActiveFilters: boolean
  onSearchChange: (value: string) => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onCategoryFiltersChange: (value: string[]) => void
  onAccountFiltersChange: (value: string[]) => void
  onCurrencyChange: (value: 'all' | 'USD' | 'UYU') => void
  onTypeChange: (value: 'all' | 'credit' | 'debit') => void
  onMinAmountChange: (value: string) => void
  onMaxAmountChange: (value: string) => void
  onClearAll: () => void
}

export function TransactionFilters({
  searchTerm,
  dateFromFilter,
  dateToFilter,
  categoryFilters,
  accountFilters,
  currencyFilter,
  typeFilter,
  minAmount,
  maxAmount,
  availableCategories,
  hasActiveFilters,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onCategoryFiltersChange,
  onAccountFiltersChange,
  onCurrencyChange,
  onTypeChange,
  onMinAmountChange,
  onMaxAmountChange,
  onClearAll,
}: TransactionFiltersProps) {
  const [amountPanelOpen, setAmountPanelOpen] = useState(false)
  const minAmountId = useId()
  const maxAmountId = useId()

  const categoryOptions = availableCategories.map((cat) => ({
    value: cat,
    label: getCategoryDisplay(cat).label,
    color: getCategoryDisplay(cat).color,
  }))

  const amountActive = Boolean(minAmount) || Boolean(maxAmount)

  // Build active chips (search has its own × in the input, date is MonthNav)
  const chips: { label: string; onClear: () => void }[] = []
  categoryFilters.forEach((c) => {
    chips.push({
      label: getCategoryDisplay(c).label,
      onClear: () =>
        onCategoryFiltersChange(categoryFilters.filter((x) => x !== c)),
    })
  })
  accountFilters.forEach((a) => {
    const opt = ACCOUNT_OPTIONS.find((o) => o.value === a)
    chips.push({
      label: opt?.label ?? a,
      onClear: () =>
        onAccountFiltersChange(accountFilters.filter((x) => x !== a)),
    })
  })
  if (currencyFilter !== 'all') {
    chips.push({
      label: currencyFilter === 'USD' ? 'Dólares' : 'Pesos',
      onClear: () => onCurrencyChange('all'),
    })
  }
  if (typeFilter !== 'all') {
    chips.push({
      label: typeFilter === 'credit' ? 'Ingresos' : 'Gastos',
      onClear: () => onTypeChange('all'),
    })
  }
  if (minAmount || maxAmount) {
    chips.push({
      label: `Monto ${minAmount || '0'}–${maxAmount || '∞'}`,
      onClear: () => {
        onMinAmountChange('')
        onMaxAmountChange('')
      },
    })
  }

  return (
    <Card className="p-4 space-y-3">
      {/* Row 1: Search + Category + Account + Type + Currency + Monto */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <div className="relative w-full sm:flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            placeholder="Buscar por comercio o descripción..."
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9 text-[13px]!"
          />
        </div>

        <MultiSelectPopover
          label="Categoría"
          ariaLabel="Filtro categoría"
          options={categoryOptions}
          selected={categoryFilters}
          onChange={onCategoryFiltersChange}
        />

        <MultiSelectPopover
          label="Cuenta"
          ariaLabel="Filtro cuenta"
          options={ACCOUNT_OPTIONS}
          selected={accountFilters}
          onChange={onAccountFiltersChange}
        />

        {/* Type filter */}
        <SegmentedToggle
          options={[
            { value: 'all' as const, label: 'Todos' },
            { value: 'credit' as const, label: 'Ingresos' },
            { value: 'debit' as const, label: 'Gastos' },
          ]}
          value={typeFilter}
          onChange={onTypeChange}
          size="sm"
          aria-label="Tipo de transacción"
        />

        {/* Currency filter */}
        <SegmentedToggle
          options={[
            { value: 'all' as const, label: 'Todo' },
            { value: 'UYU' as const, label: '$U' },
            { value: 'USD' as const, label: 'US$' },
          ]}
          value={currencyFilter}
          onChange={onCurrencyChange}
          size="sm"
          aria-label="Moneda"
        />

        {/* Monto advanced panel toggle */}
        <Button
          variant={amountPanelOpen || amountActive ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAmountPanelOpen((o) => !o)}
          className="gap-[5px]"
        >
          <Filter size={14} />
          Monto
        </Button>
      </div>

      {/* Advanced amount panel */}
      {amountPanelOpen && (
        <div className="grid grid-cols-[repeat(2,1fr)] gap-[14px] border-t border-[var(--border)] pt-[14px]">
          <div>
            <label
              htmlFor={minAmountId}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5"
            >
              Monto mínimo
            </label>
            <Input
              id={minAmountId}
              type="number"
              placeholder="0"
              value={minAmount}
              onChange={(e) => onMinAmountChange(e.target.value)}
              className="text-[13px]!"
            />
          </div>
          <div>
            <label
              htmlFor={maxAmountId}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5"
            >
              Monto máximo
            </label>
            <Input
              id={maxAmountId}
              type="number"
              placeholder="∞"
              value={maxAmount}
              onChange={(e) => onMaxAmountChange(e.target.value)}
              className="text-[13px]!"
            />
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-[8px]">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex h-[26px] items-center gap-[4px] rounded-[999px] border border-[var(--border)] bg-[var(--muted)] px-[8px] py-0 text-[13px] font-[500] text-[var(--text)]"
            >
              {chip.label}
              <button
                onClick={chip.onClear}
                aria-label={`Quitar filtro ${chip.label}`}
                className="grid cursor-pointer place-items-center rounded-[999px] border-none [background:none] p-0 text-[var(--text-muted)]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {hasActiveFilters && chips.length > 0 && (
            <button
              onClick={onClearAll}
              className="cursor-pointer border-none [background:none] px-[4px] py-0 text-[13px] font-[500] text-[var(--brand)]"
            >
              Limpiar todo
            </button>
          )}
        </div>
      )}

      {/* Hidden date inputs kept for test accessibility */}
      <input
        id="transactions-date-from-filter"
        aria-label="Filtro fecha desde"
        type="date"
        value={dateFromFilter}
        onChange={(event) => onDateFromChange(event.target.value)}
        className="hidden"
      />
      <input
        id="transactions-date-to-filter"
        aria-label="Filtro fecha hasta"
        type="date"
        value={dateToFilter}
        onChange={(event) => onDateToChange(event.target.value)}
        className="hidden"
      />
    </Card>
  )
}
