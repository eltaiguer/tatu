import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Layout } from './Layout'

describe('Layout', () => {
  it('renders title, subtitle, and children', () => {
    render(
      <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    expect(screen.getByText('Tatu - Expense Tracker')).toBeInTheDocument()
    expect(screen.getByText('Santander Uruguay')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders navigation items', () => {
    render(
      <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
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
      <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
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
      <Layout title="Tatu - Expense Tracker" subtitle="Santander Uruguay">
        <div>Content</div>
      </Layout>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(section.scrollIntoView).toHaveBeenCalled()

    document.body.removeChild(section)
  })
})
