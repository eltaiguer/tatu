import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FxChip } from './FxChip'
import { AppSidebar } from './AppSidebar'

describe('FxChip', () => {
  const BUTTON = '1 US$ = $U 40,50 (manual) · cambiar'

  function openEditor(onSetFxRate = vi.fn()) {
    render(<FxChip fxRate={40.5} onSetFxRate={onSetFxRate} />)
    fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    return {
      onSetFxRate,
      input: screen.getByRole('textbox', { name: 'Tipo de cambio' }),
    }
  }

  it("says the rate is the user's own, keeping the rate in its name", () => {
    render(<FxChip fxRate={40.5} onSetFxRate={vi.fn()} />)

    const chip = screen.getByRole('button', { name: BUTTON })
    expect(chip).toHaveTextContent('(manual)')
  })

  it('typing "41,5" and Enter saves 41.5', () => {
    const { onSetFxRate, input } = openEditor()

    fireEvent.change(input, { target: { value: '41,5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSetFxRate).toHaveBeenCalledTimes(1)
    expect(onSetFxRate).toHaveBeenCalledWith(41.5)
    expect(screen.getByRole('button', { name: /cambiar/ })).toBeInTheDocument()
  })

  it('seeds the editor with the rate in es-UY', () => {
    const { input } = openEditor()

    expect(input).toHaveValue('40,5')
  })

  it.each(['41abc', '1.234,5', 'abc', '0', ''])(
    'does not save an invalid rate (%j)',
    (value) => {
      const { onSetFxRate, input } = openEditor()

      fireEvent.change(input, { target: { value } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onSetFxRate).not.toHaveBeenCalled()
    }
  )

  it('Escape cancels without saving', () => {
    const { onSetFxRate, input } = openEditor()

    fireEvent.change(input, { target: { value: '50' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSetFxRate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: BUTTON })).toBeInTheDocument()
  })

  it('is read-only without a setter', () => {
    render(<FxChip fxRate={40.5} />)

    expect(screen.getByText('1 US$ = $U 40,50 (manual)')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each(['Enter', 'Escape'])(
    'swallows the %s keypress so the refocused button is not clicked',
    (key) => {
      // A browser sends the key's activation to the newly focused button,
      // which would reopen the editor right after the commit.
      const { input } = openEditor()

      const notPrevented = fireEvent.keyDown(input, { key })

      expect(notPrevented).toBe(false)
    }
  )

  it.each(['Enter', 'Escape'])(
    'focus goes back to the button after %s',
    (key) => {
      const { input } = openEditor()

      fireEvent.keyDown(input, { key })

      expect(screen.getByRole('button', { name: /cambiar/ })).toHaveFocus()
    }
  )
})

describe('brand-filled controls', () => {
  it('use the theme-aware text color, not hard-coded white', () => {
    // In dark mode the brand is a light teal; white text on it fails AA.
    render(
      <AppSidebar
        view="overview"
        onNavigate={vi.fn()}
        onImport={vi.fn()}
        onSignOut={vi.fn()}
        session={null}
        uncategorizedCount={0}
        supabaseEnabled
      />
    )

    // jsdom doesn't load Tailwind, so assert the token-based class.
    const importButton = screen.getAllByRole('button', { name: /Importar/ })[0]
    expect(importButton).toHaveClass('text-[var(--primary-foreground)]')
    expect(importButton.className).not.toMatch(/white|#fff/i)
  })
})
