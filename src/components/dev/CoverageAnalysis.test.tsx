import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Transaction } from '../../models'
import { createInMemoryRepository } from '../../services/repository/in-memory-repository'
import { CoverageAnalysis } from './CoverageAnalysis'

function tx(id: string, description: string): Transaction {
  return {
    id,
    date: new Date('2026-03-01T00:00:00.000Z'),
    description,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'credit_card',
    rawData: {},
  }
}

describe('CoverageAnalysis (dev panel)', () => {
  it("analyses the user's stored rows and overrides, read through the repository", async () => {
    const repository = createInMemoryRepository({
      transactions: [tx('a', 'DISCO 12'), tx('b', 'TIENDA RARA')],
      deleted: [tx('c', 'OTRA TIENDA')],
      categoryOverrides: [
        {
          merchantNormalized: 'tienda rara',
          category: 'groceries',
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    render(<CoverageAnalysis repository={repository} />)

    fireEvent.click(screen.getByRole('button', { name: 'Analizar cobertura' }))

    expect(await screen.findByText('2 merchants únicos')).toBeInTheDocument()
    expect(screen.getByText(/1 overrides de usuario confirmados/)).toBeVisible()
  })

  it('cannot run without a signed-in user', () => {
    render(<CoverageAnalysis repository={null} />)

    expect(
      screen.getByRole('button', { name: 'Analizar cobertura' })
    ).toBeDisabled()
  })
})
