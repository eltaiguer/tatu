import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Transaction } from '../../models'
import { createInMemoryRepository } from '../../services/repository/in-memory-repository'
import {
  clearAllCategoryOverrides,
  replaceMerchantCategoryOverrides,
} from '../../services/categorizer/category-overrides'
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

afterEach(() => clearAllCategoryOverrides())

describe('CoverageAnalysis (dev panel)', () => {
  it("analyses the user's stored rows (one read) against the loaded overrides", async () => {
    const repository = createInMemoryRepository({
      transactions: [tx('a', 'DISCO 12'), tx('b', 'TIENDA RARA')],
      deleted: [tx('c', 'OTRA TIENDA')],
    })
    // The workspace already holds the user's overrides.
    replaceMerchantCategoryOverrides({
      'tienda rara': {
        merchantName: 'TIENDA RARA',
        category: 'groceries',
        updatedAt: '',
      },
    })
    render(<CoverageAnalysis repository={repository} />)

    fireEvent.click(screen.getByRole('button', { name: 'Analizar cobertura' }))

    expect(await screen.findByText('2 merchants únicos')).toBeInTheDocument()
    expect(screen.getByText(/1 overrides de usuario confirmados/)).toBeVisible()
    // Only the transactions are read, not the whole workspace.
    expect(repository.requests).toEqual({ loadTransactions: 1 })
  })

  it('cannot run without a signed-in user', () => {
    render(<CoverageAnalysis repository={null} />)

    expect(
      screen.getByRole('button', { name: 'Analizar cobertura' })
    ).toBeDisabled()
  })
})
