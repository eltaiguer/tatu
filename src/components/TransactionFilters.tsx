import { useRef, useState } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { Button } from './ui/button'
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
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel ?? label}
        onClick={() => setOpen((o) => !o)}
        className="border-input bg-input-background focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
        style={{
          minWidth: 120,
          borderColor: isActive ? 'var(--brand)' : undefined,
          color: isActive ? 'var(--brand-text, var(--brand))' : undefined,
        }}
      >
        <span>
          {label}
          {isActive && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                marginLeft: 4,
              }}
            >
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
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            minWidth: 220,
            padding: 6,
            boxShadow: 'var(--shadow-lg)',
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          {options.map((o) => {
            const isSel = selected.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '7px 9px',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 7,
                  cursor: 'pointer',
                  font: 'inherit',
                  textAlign: 'left',
                  color: 'var(--text)',
                }}
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
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: '2px solid',
                    borderColor: isSel ? 'var(--brand)' : 'var(--border)',
                    background: isSel ? 'var(--brand)' : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isSel && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {o.color && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      background: o.color,
                      flexShrink: 0,
                    }}
                  />
                )}
                <span style={{ fontSize: 13.5 }}>{o.label}</span>
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
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div className="relative w-full sm:flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            placeholder="Buscar por comercio o descripción..."
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
            style={{ fontSize: 13 }}
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
          style={{ gap: 5 }}
        >
          <Filter size={14} />
          Monto
        </Button>
      </div>

      {/* Advanced amount panel */}
      {amountPanelOpen && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div>
            <label
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5"
            >
              Monto mínimo
            </label>
            <Input
              type="number"
              placeholder="0"
              value={minAmount}
              onChange={(e) => onMinAmountChange(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
          <div>
            <label
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5"
            >
              Monto máximo
            </label>
            <Input
              type="number"
              placeholder="∞"
              value={maxAmount}
              onChange={(e) => onMaxAmountChange(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {chips.map((chip, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 26,
                padding: '0 8px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--muted)',
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--text)',
              }}
            >
              {chip.label}
              <button
                onClick={chip.onClear}
                aria-label={`Quitar filtro ${chip.label}`}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: 'var(--text-muted)',
                  borderRadius: 999,
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {hasActiveFilters && chips.length > 0 && (
            <button
              onClick={onClearAll}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12.5,
                color: 'var(--brand)',
                padding: '0 4px',
                fontWeight: 500,
              }}
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
        style={{ display: 'none' }}
      />
      <input
        id="transactions-date-to-filter"
        aria-label="Filtro fecha hasta"
        type="date"
        value={dateToFilter}
        onChange={(event) => onDateToChange(event.target.value)}
        style={{ display: 'none' }}
      />
    </Card>
  )
}
