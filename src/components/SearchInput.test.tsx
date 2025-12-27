import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SearchInput } from './SearchInput'

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces change events', () => {
    const onChange = vi.fn()
    render(<SearchInput value="" onChange={onChange} debounceMs={300} />)

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'netflix' },
    })

    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledWith('netflix')
  })

  it('shows suggestions and applies selection', () => {
    const onChange = vi.fn()
    render(
      <SearchInput
        value=""
        onChange={onChange}
        suggestions={['Netflix', 'Devoto']}
        debounceMs={300}
      />
    )

    const input = screen.getByRole('searchbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ne' } })

    const suggestion = screen.getByRole('option', { name: 'Netflix' })
    fireEvent.click(suggestion)

    expect(onChange).toHaveBeenCalledWith('Netflix')
    expect(input).toHaveValue('Netflix')
  })
})
