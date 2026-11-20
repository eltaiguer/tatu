import { useRef, useState } from 'react'
import { House, Search, X } from 'lucide-react'
import { cn } from './ui/utils'
import { Input } from './ui/input'
import { FiltersPanel } from './transactions/FiltersPanel'
import { secondaryFilterChips } from './transactions/secondary-filters'
import { resolveCategory } from '../services/categories/category-registry'
import { useClickOutside } from '../hooks/useClickOutside'
import type { UrlFilterState } from '../services/filters/url-filters'
import type { FilterPatch } from '../services/filters/transaction-filter'

interface MultiSelectPopoverProps<T extends string> {
  label: string
  options: { value: T; label: string; color?: string }[]
  selected: T[]
  onChange: (next: T[]) => void
  ariaLabel?: string
}

function MultiSelectPopover<T extends string>({
  label,
  options,
  selected,
  onChange,
  ariaLabel,
}: MultiSelectPopoverProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function toggle(value: T) {
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
  filters: UrlFilterState
  // Whether the view counts as "filtrado" (hasActiveFilters), decided once
  // by the view.
  hasActiveFilters: boolean
  // The period as days, for the date inputs. Not derived from `filters`
  // here: "últimos n meses" counts from an anchor only the view's state has.
  dateRange: { from: string; to: string }
  availableCategories: string[]
  // Rows hidden as ignored transfers: the panel's toggle shows the count.
  ignoredCount: number
  onChange: (patch: FilterPatch) => void
  // Editing one end of the date inputs; the view keeps the other end.
  onDateBoundChange: (bound: 'from' | 'to', value: string) => void
  onClearAll: () => void
}

export function TransactionFilters({
  filters,
  hasActiveFilters,
  dateRange,
  availableCategories,
  ignoredCount,
  onChange,
  onDateBoundChange,
  onClearAll,
}: TransactionFiltersProps) {
  const categoryOptions = availableCategories.map((cat) => {
    const { label, color } = resolveCategory(cat)
    return { value: cat, label, color }
  })

  const { search, categories, type, household, review } = filters

  // Active chips (search has its own × in the input, date is MonthNav):
  // categories, then the Filtros panel's, then A revisar.
  const chips: { label: string; onClear: () => void }[] = []
  categories.forEach((c) => {
    chips.push({
      label: resolveCategory(c).label,
      onClear: () =>
        onChange({ categories: categories.filter((x) => x !== c) }),
    })
  })
  const secondary = secondaryFilterChips(filters)
  secondary.forEach((chip) => {
    chips.push({ label: chip.label, onClear: () => onChange(chip.clear) })
  })
  if (review) {
    chips.push({
      label: 'A revisar',
      onClear: () => onChange({ review: false }),
    })
  }

  return (
    // No card of its own: it heads the movements card it filters.
    <div className="space-y-3 border-b border-[var(--border)] p-4">
      {/* Primary row: search · Categoría · Hogar · Filtros */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <div className="relative w-full sm:flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            placeholder="Buscar por comercio o descripción..."
            value={search}
            onChange={(event) => onChange({ search: event.target.value })}
            className="pl-9 text-[13px]!"
          />
        </div>

        <MultiSelectPopover
          label="Categoría"
          ariaLabel="Filtro categoría"
          options={categoryOptions}
          selected={categories}
          onChange={(next) => onChange({ categories: next })}
        />

        {/* Household filter: one toggle chip, the pressed state is the filter.
            Income has no household answer, so the two never combine: the
            latest pick wins (here and in the type toggle). */}
        <button
          type="button"
          aria-pressed={household !== 'all'}
          aria-label="Filtro Hogar"
          onClick={() =>
            onChange(
              household !== 'all'
                ? { household: 'all' }
                : type === 'credit'
                  ? { household: 'household', type: 'all' }
                  : { household: 'household' }
            )
          }
          className={cn(
            'bg-input-background focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]',
            household !== 'all'
              ? 'border-[var(--brand)] text-[var(--brand-text,var(--brand))]'
              : 'border-input focus-visible:border-ring'
          )}
        >
          <House size={14} aria-hidden="true" />
          Hogar
        </button>

        <FiltersPanel
          filters={filters}
          ignoredCount={ignoredCount}
          activeCount={secondary.length}
          onChange={onChange}
        />
      </div>

      {/* Active filter chips */}
      {(chips.length > 0 || household !== 'all') && (
        <div className="flex flex-wrap items-center gap-[8px]">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex h-[26px] items-center gap-[4px] rounded-[999px] border border-[var(--border)] bg-[var(--muted)] px-[8px] py-0 text-[13px] font-[500] text-[var(--text)]"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onClear}
                aria-label={`Quitar filtro ${chip.label}`}
                className="grid cursor-pointer place-items-center rounded-[999px] border-none [background:none] p-0 text-[var(--text-muted)]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {hasActiveFilters && (chips.length > 0 || household !== 'all') && (
            <button
              type="button"
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
        value={dateRange.from}
        onChange={(event) => onDateBoundChange('from', event.target.value)}
        className="hidden"
      />
      <input
        id="transactions-date-to-filter"
        aria-label="Filtro fecha hasta"
        type="date"
        value={dateRange.to}
        onChange={(event) => onDateBoundChange('to', event.target.value)}
        className="hidden"
      />
    </div>
  )
}
