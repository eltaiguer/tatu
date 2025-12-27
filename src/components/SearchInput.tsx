import { useEffect, useMemo, useRef, useState } from 'react'
import { normalizeMerchantName } from '../services/categorizer/merchant-patterns'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  suggestions?: string[]
  debounceMs?: number
  placeholder?: string
}

export function SearchInput({
  value,
  onChange,
  suggestions = [],
  debounceMs = 300,
  placeholder = 'Search description',
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const [isFocused, setIsFocused] = useState(false)
  const lastEmittedRef = useRef(value)

  useEffect(() => {
    setLocalValue(value)
    lastEmittedRef.current = value
  }, [value])

  useEffect(() => {
    if (localValue === lastEmittedRef.current) {
      return
    }

    const handle = window.setTimeout(() => {
      lastEmittedRef.current = localValue
      onChange(localValue)
    }, debounceMs)

    return () => window.clearTimeout(handle)
  }, [localValue, debounceMs, onChange])

  const filteredSuggestions = useMemo(() => {
    const normalizedQuery = normalizeMerchantName(localValue)
    if (!normalizedQuery) {
      return []
    }

    return suggestions
      .filter((suggestion) =>
        normalizeMerchantName(suggestion).includes(normalizedQuery)
      )
      .slice(0, 5)
  }, [localValue, suggestions])

  const handleSelect = (suggestion: string) => {
    setLocalValue(suggestion)
    lastEmittedRef.current = suggestion
    onChange(suggestion)
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        aria-label="Search transactions"
        aria-expanded={isFocused && filteredSuggestions.length > 0}
        aria-controls="search-suggestions"
        className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
      />
      {isFocused && filteredSuggestions.length > 0 ? (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute z-10 mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
        >
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
