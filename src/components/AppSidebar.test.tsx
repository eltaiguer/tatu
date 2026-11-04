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

  it('leaves no inline colour behind after hovering a nav item', () => {
    // Guards against re-adding JS hover handlers: they wrote inline styles,
    // and a hover colour could stick to an item after a click.
    renderSidebar('overview')

    for (const name of ['Resumen', 'Insights']) {
      const item = screen.getByRole('button', { name })
      fireEvent.mouseOver(item)
      fireEvent.mouseOut(item)
      expect(item.style.background).toBe('')
      expect(item.style.color).toBe('')
    }
  })

  it('signs out from the user row, which keeps the name and email', () => {
    const { onSignOut } = renderSidebar()

    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
