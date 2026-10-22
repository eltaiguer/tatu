import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AppSidebar, type View } from './AppSidebar'
import type { AuthSession } from '../services/auth/auth-port'

const session = {
  user: { email: 'ana@example.com', user_metadata: {} },
} as unknown as AuthSession

function renderSidebar(view: View = 'overview') {
  const onSignOut = vi.fn()
  render(
    <AppSidebar
      view={view}
      onNavigate={vi.fn()}
      onImport={vi.fn()}
      onSignOut={onSignOut}
      session={session}
      uncategorizedCount={3}
      supabaseEnabled
    />
  )
  return { onSignOut }
}

describe('AppSidebar', () => {
  it('marks only the current view as the current page', () => {
    renderSidebar('transactions')

    expect(
      screen.getByRole('button', { name: /Transacciones/ })
    ).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Resumen' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('styles nav items by state with classes, never inline styles', () => {
    renderSidebar('overview')

    const active = screen.getByRole('button', { name: 'Resumen' })
    const inactive = screen.getByRole('button', { name: 'Insights' })
    // Hovering used to write inline background/color, which could stick.
    fireEvent.mouseOver(inactive)
    fireEvent.mouseOut(inactive)
    fireEvent.mouseOver(active)

    for (const item of [active, inactive]) {
      expect(item.style.background).toBe('')
      expect(item.style.color).toBe('')
    }
    expect(active).toHaveClass('bg-[var(--brand-soft)]')
    expect(inactive).toHaveClass('hover:bg-[var(--surface-2)]')
    expect(active).not.toHaveClass('hover:bg-[var(--surface-2)]')
  })

  it('leaves no inline style on Importar or sign-out after pointer use', () => {
    renderSidebar()

    const importButton = screen.getByRole('button', { name: /Importar/ })
    fireEvent.mouseOver(importButton)
    fireEvent.mouseDown(importButton)
    expect(importButton.style.background).toBe('')
    expect(importButton.style.transform).toBe('')

    const signOut = screen.getByRole('button', { name: 'Cerrar sesión' })
    fireEvent.mouseOver(signOut)
    expect(signOut.style.color).toBe('')
  })

  it('gives every sidebar control a visible keyboard focus ring', () => {
    renderSidebar()

    // jsdom doesn't load Tailwind, so assert the token-based classes.
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('focus-visible:ring-2')
      expect(button).toHaveClass('focus-visible:ring-[var(--ring)]')
    }
  })

  it('signs out from the user row, which keeps the name and email', () => {
    const { onSignOut } = renderSidebar()

    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
