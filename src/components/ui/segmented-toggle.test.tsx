import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('is a radio group whose checked radio is the active option', () => {
    render(
      <SegmentedToggle
        options={OPTIONS}
        value="auto"
        onChange={vi.fn()}
        aria-label="Elegir tema"
      />
    )
    const group = screen.getByRole('radiogroup', { name: 'Elegir tema' })
    expect(within(group).getByRole('radio', { name: 'Auto' })).toBeChecked()
    expect(
      within(group).getByRole('radio', { name: 'Claro' })
    ).not.toBeChecked()
    // Filters and settings, not tabs: no tab or toggle-button state mixed in.
    expect(screen.queryByRole('tab')).toBeNull()
    for (const radio of within(group).getAllByRole('radio')) {
      expect(radio).not.toHaveAttribute('aria-pressed')
      expect(radio).not.toHaveAttribute('aria-selected')
    }
  })

  it('keeps only the active option in the tab order and moves with arrows', () => {
    const onChange = vi.fn()
    render(
      <SegmentedToggle options={OPTIONS} value="light" onChange={onChange} />
    )
    const light = screen.getByRole('radio', { name: 'Claro' })
    expect(light).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute(
      'tabindex',
      '-1'
    )

    fireEvent.keyDown(light, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveFocus()
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
    expect(
      screen.getByRole('radiogroup', { name: 'Elegir tema' })
    ).toBeInTheDocument()
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
