import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '../../models'
import { createInMemoryRepository } from '../../services/repository/in-memory-repository'
import {
  clearAllCategoryOverrides,
  setMerchantCategoryOverride,
} from '../../services/categorizer/category-overrides'
import { CoverageAnalysis } from './CoverageAnalysis'

const KIOSCO: Transaction = {
  id: 'tx-1',
  date: new Date('2026-03-01T00:00:00.000Z'),
  description: 'KIOSCO 25',
  amount: 100,
  currency: 'UYU',
  type: 'debit',
  source: 'bank_account',
  rawData: {},
  category: 'personal',
  categoryConfidence: 1,
}

describe('CoverageAnalysis', () => {
  afterEach(() => clearAllCategoryOverrides())

  // The stored rows, categorized with the workspace's rules: the same
  // overrides the Override column reports.
  it('categorizes the stored rows with the workspace merchant overrides', async () => {
    setMerchantCategoryOverride('KIOSCO 25', 'personal')
    const repository = createInMemoryRepository({ transactions: [KIOSCO] })
    render(<CoverageAnalysis repository={repository} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Analizar cobertura' })
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Alta (1)' })
    )

    const row = within(
      screen.getByTitle('KIOSCO 25').closest('tr') as HTMLElement
    )
    expect(row.getAllByText('personal')).toHaveLength(2)
    expect(row.getByText('✓')).toBeTruthy()
  })
})
