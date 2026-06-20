import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SegmentedToggle } from './segmented-toggle'

const OPTIONS = [
  { label: 'Claro', value: 'light' },
  { label: 'Auto', value: 'auto' },
  { label: 'Oscuro', value: 'dark' },
] as const

describe('SegmentedToggle', () => {
  it('renders all options', () => {
    const onChange = vi.fn()
    render(
      <SegmentedToggle options={OPTIONS} value="light" onChange={onChange} />
    )
    expect(screen.getByText('Claro')).toBeInTheDocument()
    expect(screen.getByText('Auto')).toBeInTheDocument()
    expect(screen.getByText('Oscuro')).toBeInTheDocument()
  })

  it('marks the active option as selected', () => {
    render(
      <SegmentedToggle
        options={OPTIONS}
        value="auto"
        onChange={vi.fn()}
      />
    )
    const autoBtn = screen.getByText('Auto')
    expect(autoBtn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Claro')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange when a different option is clicked', () => {
    const onChange = vi.fn()
    render(
      <SegmentedToggle options={OPTIONS} value="light" onChange={onChange} />
    )
    fireEvent.click(screen.getByText('Oscuro'))
    expect(onChange).toHaveBeenCalledWith('dark')
  })

  it('navigates with arrow keys', () => {
    const onChange = vi.fn()
    render(
      <SegmentedToggle options={OPTIONS} value="light" onChange={onChange} />
    )
    const lightBtn = screen.getByText('Claro')
    fireEvent.keyDown(lightBtn, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('auto')
  })

  it('wraps around when navigating past the last option', () => {
    const onChange = vi.fn()
    render(
      <SegmentedToggle options={OPTIONS} value="dark" onChange={onChange} />
    )
    const darkBtn = screen.getByText('Oscuro')
    fireEvent.keyDown(darkBtn, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('light')
  })

  it('uses aria-label on the container', () => {
    render(
      <SegmentedToggle
        options={OPTIONS}
        value="light"
        onChange={vi.fn()}
        aria-label="Elegir tema"
      />
    )
    expect(screen.getByRole('tablist', { name: 'Elegir tema' })).toBeInTheDocument()
  })

  it('applies sm size', () => {
    render(
      <SegmentedToggle
        options={[{ label: 'A', value: 'a' }]}
        value="a"
        onChange={vi.fn()}
        size="sm"
      />
    )
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
