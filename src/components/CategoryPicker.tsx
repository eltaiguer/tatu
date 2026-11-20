import { useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Category } from '../models'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import { CategoryBadge } from './CategoryBadge'
import { Input } from './ui/input'
import { focusFirstOption, handleOptionListKeyDown } from './ui/option-list'
import { cn } from './ui/utils'
import {
  buildCategorySuggestions,
  filterCategorySuggestions,
} from '../services/suggestions/suggestions'

interface CategoryPickerProps {
  /** The current category: marked with a check and aria-current. */
  value?: string | null
  onPick: (categoryId: string) => void
  /** Touch targets (a bottom sheet): taller options. */
  touch?: boolean
}

/**
 * The body of a category picker: a search over the pickable categories and a
 * list of options, with the keys of a picker list (ArrowDown from the search
 * into the list, Enter picks the first match). Container-agnostic — it sits in
 * a popover or a sheet; the caller closes it from `onPick`.
 */
export function CategoryPicker({ value, onPick, touch }: CategoryPickerProps) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const matches = useMemo(
    () =>
      filterCategorySuggestions(
        buildCategorySuggestions([value ?? '']).filter(
          (id) => id !== Category.Uncategorized
        ),
        query
      ),
    [value, query]
  )

  return (
    <div className="p-2 space-y-2">
      <Input
        aria-label="Buscar categoría"
        placeholder="Buscar categoría…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            // An empty search is not a choice: no first-in-the-list pick.
            if (query.trim() && matches[0]) onPick(matches[0])
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            focusFirstOption(listRef.current)
          }
        }}
      />
      <div
        ref={listRef}
        className="max-h-56 overflow-y-auto overscroll-contain space-y-1 pr-2 [-webkit-overflow-scrolling:touch]"
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onKeyDown={handleOptionListKeyDown}
      >
        {matches.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            Ninguna categoría coincide
          </p>
        ) : (
          matches.map((id) => {
            const current = id === normalizeCategoryId(value)
            return (
              <button
                key={id}
                type="button"
                data-category-option
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent',
                  touch && 'min-h-11'
                )}
                onClick={() => onPick(id)}
              >
                <CategoryBadge categoryId={id} size="sm" />
                {current && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
