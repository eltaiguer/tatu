import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from './Layout'

describe('Layout', () => {
  it('renders title, subtitle, and children', () => {
    render(
      <MemoryRouter>
        <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(screen.getByText('Tatu - Expense Tracker')).toBeInTheDocument()
    expect(screen.getByText('Santander Uruguay')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    render(
      <MemoryRouter>
        <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      '/'
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    )
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'href',
      '/transactions'
    )
  })

  it('uses responsive navigation classes', () => {
    render(
      <MemoryRouter>
        <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    const desktopNav = screen.getByTestId('layout-desktop-nav')
    expect(desktopNav.className).toContain('hidden')
    expect(desktopNav.className).toContain('md:flex')
  })

  it('marks the active link from the current route', () => {
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('link', { name: 'Transactions' })
    ).toHaveAttribute('aria-current', 'page')
  })

  it('applies font-display class to the title heading', () => {
    render(
      <MemoryRouter>
        <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    const heading = screen.getByRole('heading', { name: 'Tatu - Expense Tracker', level: 1 })
    expect(heading.className).toContain('font-display')
  })
})
