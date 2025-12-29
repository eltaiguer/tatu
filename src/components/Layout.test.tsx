import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Layout } from './Layout'

describe('Layout', () => {
  it('renders logo, subtitle, and children', () => {
    render(
      <Layout subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('Tatú')).toBeInTheDocument()
    expect(screen.getByText('Santander Uruguay')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    render(
      <Layout subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      '#import'
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '#dashboard'
    )
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'href',
      '#transactions'
    )
  })

  it('uses responsive navigation classes', () => {
    render(
      <Layout subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    const desktopNav = screen.getByTestId('layout-desktop-nav')
    expect(desktopNav.className).toContain('hidden')
    expect(desktopNav.className).toContain('md:flex')
  })

  it('scrolls to sections when clicking navigation links', () => {
    const section = document.createElement('div')
    section.id = 'dashboard'
    section.scrollIntoView = vi.fn()
    document.body.appendChild(section)

    render(
      <Layout subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(section.scrollIntoView).toHaveBeenCalled()

    document.body.removeChild(section)
  })

  it('marks the active link from the URL hash', () => {
    window.location.hash = '#transactions'

    render(
      <Layout subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    expect(
      screen.getByRole('link', { name: 'Transactions' })
    ).toHaveAttribute('aria-current', 'page')
  })
})
