import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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

    expect(screen.getByText('Import')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
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
})
