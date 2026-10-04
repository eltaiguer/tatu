import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './page-header'

describe('PageHeader', () => {
  it('renders one title with its subtitle, extra content and actions', () => {
    render(
      <PageHeader
        title="Transacciones"
        subtitle="25 movimientos"
        actions={<button type="button">Exportar</button>}
      >
        <span>Comercio: UBER</span>
      </PageHeader>
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Transacciones' })
    ).toBeInTheDocument()
    expect(screen.getByText('25 movimientos')).toBeInTheDocument()
    expect(screen.getByText('Comercio: UBER')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument()
  })
})
