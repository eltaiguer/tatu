import { ChevronDown, Eye, EyeOff, Search, X } from 'lucide-react'
import { DateRangePicker } from './DateRangePicker'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover'
import { CategoryBadge } from './CategoryBadge'
import { SegmentedToggle } from './ui/segmented-toggle'

interface TransactionFiltersProps {
  searchTerm: string
  dateFromFilter: string
  dateToFilter: string
  categoryFilter: string
  accountFilter: 'all' | 'credit_card' | 'bank_account'
  currencyFilter: 'all' | 'USD' | 'UYU'
  typeFilter: 'all' | 'credit' | 'debit'
  showIgnored: boolean
  availableCategories: string[]
  hasActiveFilters: boolean
  onSearchChange: (value: string) => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onAccountChange: (value: 'all' | 'credit_card' | 'bank_account') => void
  onCurrencyChange: (value: 'all' | 'USD' | 'UYU') => void
  onTypeChange: (value: 'all' | 'credit' | 'debit') => void
  onShowIgnoredChange: (value: boolean) => void
  onClearAll: () => void
}

export function TransactionFilters({
  searchTerm,
  dateFromFilter,
  dateToFilter,
  categoryFilter,
  accountFilter,
  currencyFilter,
  typeFilter,
  showIgnored,
  availableCategories,
  hasActiveFilters,
  onSearchChange,
  onDateFromChange,
  onDateToChange,
  onCategoryChange,
  onAccountChange,
  onCurrencyChange,
  onTypeChange,
  onShowIgnoredChange,
  onClearAll,
}: TransactionFiltersProps) {
  return (
    <Card className="p-4 space-y-3">
      {/* Row 1: Search + Category + Account */}
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
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

        {/* Category picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              id="transactions-category-filter"
              aria-label="Filtro categoría"
              className="border-input bg-input-background focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
              style={{ minWidth: 130 }}
            >
              {categoryFilter ? (
                <CategoryBadge categoryId={categoryFilter} size="sm" />
              ) : (
                <span className="text-muted-foreground">Categoría</span>
              )}
              <ChevronDown size={14} className="text-muted-foreground ml-auto shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-1 w-[220px]" align="start">
            <PopoverClose asChild>
              <button
                className="w-full rounded px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/50"
                onClick={() => onCategoryChange('')}
              >
                Todas las categorías
              </button>
            </PopoverClose>
            {availableCategories.map((cat) => (
              <PopoverClose key={cat} asChild>
                <button
                  className="w-full rounded px-3 py-1.5 text-left hover:bg-muted/50"
                  onClick={() => onCategoryChange(cat)}
                >
                  <CategoryBadge categoryId={cat} size="sm" />
                </button>
              </PopoverClose>
            ))}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              id="transactions-account-filter"
              aria-label="Filtro cuenta"
              className="border-input bg-input-background focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]"
              style={{ minWidth: 130 }}
            >
              <span className={accountFilter === 'all' ? 'text-muted-foreground' : ''}>
                {accountFilter === 'all'
                  ? 'Cuenta'
                  : accountFilter === 'bank_account'
                    ? 'Cuenta bancaria'
                    : 'Tarjeta'}
              </span>
              <ChevronDown size={14} className="text-muted-foreground ml-auto shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-1 w-[180px]" align="start">
            {(
              [
                { value: 'all', label: 'Todas las cuentas' },
                { value: 'bank_account', label: 'Cuenta bancaria' },
                { value: 'credit_card', label: 'Tarjeta' },
              ] as const
            ).map(({ value, label }) => (
              <PopoverClose key={value} asChild>
                <button
                  className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                  style={{ fontWeight: accountFilter === value ? 600 : 400 }}
                  onClick={() => onAccountChange(value)}
                >
                  {label}
                </button>
              </PopoverClose>
            ))}
          </PopoverContent>
        </Popover>
        <DateRangePicker
          dateFrom={dateFromFilter}
          dateTo={dateToFilter}
          onChange={(from, to) => {
            onDateFromChange(from)
            onDateToChange(to)
          }}
        />
      </div>

      {/* Row 2: Type segment + Currency segment + Ignored toggle + Clear */}
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
      >
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

        {/* Ignored categories toggle */}
        <button
          aria-label={showIgnored ? 'Ocultar categorías ignoradas' : 'Mostrar categorías ignoradas'}
          title={showIgnored ? 'Ocultar categorías ignoradas' : 'Mostrar categorías ignoradas'}
          onClick={() => onShowIgnoredChange(!showIgnored)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 36,
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: showIgnored ? 'transparent' : 'var(--surface-2)',
            color: showIgnored ? 'var(--text-faint)' : 'var(--text)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {showIgnored ? <Eye size={15} /> : <EyeOff size={15} />}
          Ignoradas
        </button>

        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            style={{ gap: 5 }}
          >
            <X size={13} />
            Limpiar
          </Button>
        )}
      </div>

      {/* Hidden date inputs kept in DOM for test accessibility */}
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
