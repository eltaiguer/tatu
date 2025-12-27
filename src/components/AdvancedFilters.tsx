import type { FilterOptions } from '../services/filters/filters'
import { SearchInput } from './SearchInput'
import {
  getCategoryDefinition,
  getCategoryDefinitions,
} from '../services/categories/category-registry'

interface AdvancedFiltersProps {
  filters: FilterOptions
  onChange: (next: FilterOptions) => void
  searchSuggestions?: string[]
}

function toUtcDateStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toUtcDateEnd(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
}

function formatDateInput(value?: Date): string {
  if (!value) {
    return ''
  }
  return value.toISOString().slice(0, 10)
}

export function AdvancedFilters({
  filters,
  onChange,
  searchSuggestions = [],
}: AdvancedFiltersProps) {
  const categories = getCategoryDefinitions()
  const selectedCategories = filters.categories ?? []

  const updateFilters = (next: Partial<FilterOptions>) => {
    onChange({ ...filters, ...next })
  }

  const toggleCategory = (category: string) => {
    const next = selectedCategories.includes(category)
      ? selectedCategories.filter((item) => item !== category)
      : [...selectedCategories, category]
    updateFilters({ categories: next.length ? next : undefined })
  }

  const clearAll = () => {
    onChange({})
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
            Filters
          </p>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Advanced Filtering
          </h3>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          onClick={clearAll}
        >
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Search
          </p>
          <SearchInput
            value={filters.query ?? ''}
            onChange={(value) =>
              updateFilters({ query: value.trim() ? value : undefined })
            }
            suggestions={searchSuggestions}
          />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Currency
          </p>
          <select
            value={filters.currencies?.[0] ?? ''}
            onChange={(event) =>
              updateFilters({
                currencies: event.target.value
                  ? [event.target.value as 'USD' | 'UYU']
                  : undefined,
              })
            }
            className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
          >
            <option value="">All currencies</option>
            <option value="USD">USD</option>
            <option value="UYU">UYU</option>
          </select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Categories
          </p>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((category) => (
              <label
                key={category.id}
                className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                {category.label}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Date range
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col text-xs text-gray-500">
              From
              <input
                type="date"
                value={formatDateInput(filters.dateFrom)}
                onChange={(event) =>
                  updateFilters({
                    dateFrom: event.target.value
                      ? toUtcDateStart(event.target.value)
                      : undefined,
                  })
                }
                className="mt-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-700 dark:text-gray-200"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              To
              <input
                type="date"
                value={formatDateInput(filters.dateTo)}
                onChange={(event) =>
                  updateFilters({
                    dateTo: event.target.value
                      ? toUtcDateEnd(event.target.value)
                      : undefined,
                  })
                }
                className="mt-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-700 dark:text-gray-200"
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Amount range
          </p>
          <div className="space-y-3">
            <input
              type="range"
              min={0}
              max={10000}
              value={filters.amountMin ?? 0}
              onChange={(event) =>
                updateFilters({
                  amountMin: Number(event.target.value),
                })
              }
              data-testid="amount-min"
            />
            <input
              type="range"
              min={0}
              max={10000}
              value={filters.amountMax ?? 10000}
              onChange={(event) =>
                updateFilters({
                  amountMax: Number(event.target.value),
                })
              }
              data-testid="amount-max"
            />
            <p className="text-xs text-gray-500">
              {filters.amountMin ?? 0} - {filters.amountMax ?? 10000}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.query ? (
          <button
            type="button"
            onClick={() => updateFilters({ query: undefined })}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs text-gray-600 dark:text-gray-200"
          >
            Search: {filters.query}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {filters.currencies && filters.currencies.length > 0 ? (
          <button
            type="button"
            onClick={() => updateFilters({ currencies: undefined })}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs text-gray-600 dark:text-gray-200"
          >
            Currency: {filters.currencies[0]}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {selectedCategories.map((category) => {
          const definition = getCategoryDefinition(category)
          return (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs text-gray-600 dark:text-gray-200"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: definition.color }}
                aria-hidden="true"
              />
              {definition.label}
              <span aria-hidden="true">×</span>
            </button>
          )
        })}
        {filters.amountMin !== undefined || filters.amountMax !== undefined ? (
          <button
            type="button"
            onClick={() =>
              updateFilters({ amountMin: undefined, amountMax: undefined })
            }
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs text-gray-600 dark:text-gray-200"
          >
            Amount: {filters.amountMin ?? 0} - {filters.amountMax ?? 10000}
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </section>
  )
}
