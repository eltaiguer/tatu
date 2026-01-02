import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Layout } from './Layout'

describe('Layout', () => {
  it('renders logo and children', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(screen.getByText('Tatú')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Importar' })).toHaveAttribute(
      'href',
      '/'
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    )
    expect(
      screen.getByRole('link', { name: 'Transacciones' })
    ).toHaveAttribute(
      'href',
      '/transactions'
    )
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute(
      'href',
      '/insights'
    )
    expect(screen.getByRole('link', { name: 'Herramientas' })).toHaveAttribute(
      'href',
      '/tools'
    )
  })

  it('uses responsive navigation classes', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    const desktopNav = screen.getByRole('navigation', { name: 'Main' })
    expect(desktopNav.className).toContain('hidden')
    expect(desktopNav.className).toContain('md:flex')
  })

  it('marks the active link from the current route', () => {
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <Layout>
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('link', { name: 'Transacciones' })
    ).toHaveAttribute('aria-current', 'page')
  })

  it('renders the design system link', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div>Content</div>
        </Layout>
      </MemoryRouter>
    )

    expect(
      screen.getByRole('link', { name: 'Design System' })
    ).toHaveAttribute('href', '/design-system')
  })
})
