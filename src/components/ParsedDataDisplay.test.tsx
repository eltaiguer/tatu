import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParsedDataDisplay } from './ParsedDataDisplay'
import { Category } from '../models'
import type { ParsedData } from '../models'
import { clearAllCategoryOverrides } from '../services/categorizer/category-overrides'

const sampleData: ParsedData = {
  fileType: 'credit_card',
  fileName: 'sample.csv',
  parsedAt: new Date('2025-01-01T00:00:00.000Z'),
  metadata: {
    cliente: 'Test User',
    numeroTarjeta: 'XXXX-1234',
    alias: 'Visa',
    tipoProducto: 'Tarjeta de credito',
    fechaCorte: '01/01/2025',
    fechaVencimiento: '10/01/2025',
    limiteCreditoUSD: '0,00',
    limiteCreditoUYU: '0,00',
    saldoAnteriorUSD: '0,00',
    saldoAnteriorUYU: '0,00',
    pagoMinimoUSD: '0,00',
    pagoMinimoUYU: '0,00',
    pagoContadoUSD: '0,00',
    pagoContadoUYU: '0,00',
    montoVencidoUSD: '0,00',
    montoVencidoUYU: '0,00',
    periodoDesde: '01/01/2025',
    periodoHasta: '31/01/2025',
  },
  transactions: [
    {
      id: 'tx-1',
      date: new Date('2025-01-02T00:00:00.000Z'),
      description: 'Devoto Supermercado',
      amount: 120,
      currency: 'UYU',
      type: 'debit',
      source: 'credit_card',
      category: Category.Groceries,
      categoryConfidence: 0.8,
      rawData: {},
    },
  ],
}

describe('ParsedDataDisplay', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
  })

  it('calls onCategoryChange when selecting a new category', async () => {
    const user = userEvent.setup()
    const onCategoryChange = vi.fn()

    render(
      <ParsedDataDisplay
        data={sampleData}
        onReset={() => undefined}
        onCategoryChange={onCategoryChange}
      />
    )

    await act(async () => {
      await user.click(screen.getByTestId('category-pill-tx-1'))
    })

    const option = await screen.findByTestId(
      `category-option-${Category.Shopping}-tx-1`
    )

    await act(async () => {
      await user.click(option)
    })

    await waitFor(() => {
      expect(onCategoryChange).toHaveBeenCalledWith(
        'tx-1',
        Category.Shopping
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('category-menu-tx-1')).toBeNull()
    })
  })
})
