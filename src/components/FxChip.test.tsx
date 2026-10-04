import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FxChip } from './FxChip'
import { AppSidebar } from './AppSidebar'

describe('FxChip', () => {
  it("says the rate is the user's own, keeping the rate in its name", () => {
    render(<FxChip fxRate={40.5} onSetFxRate={vi.fn()} />)

    const chip = screen.getByRole('button', { name: /1 US\$ = \$U 40\.50/ })
    expect(chip).toHaveTextContent('manual')
  })
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
