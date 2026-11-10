import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { Transaction } from '../models'
import { resolveCategory } from '../services/categories/category-registry'
import { replaceCustomCategories } from '../services/categories/category-store'
import { merchantOverrideKey } from '../services/categorizer/category-overrides'
import {
  clearHouseholdRules,
  putMerchantHouseholdRule,
} from '../services/household/household-rules-store'

type DialogProps = ComponentProps<typeof EditTransactionDialog>

const transaction: Transaction = {
  id: 'tx-1',
  date: new Date('2025-03-10T12:00:00'),
  description: 'POS COMPRA DISCO 123',
  displayDescription: 'Disco',
  amount: 100,
  currency: 'USD',
  type: 'debit',
  source: 'bank_account',
  category: 'groceries',
  tags: ['super'],
  rawData: {},
}

function baseProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    transaction,
    // Fake reach: 4 similar rows, 2 once the name changes.
    countSimilar: (_transaction, renamed) => (renamed ? 2 : 4),
    countHouseholdSimilar: () => 3,
    knownTags: ['super', 'viaje', 'trabajo'],
    isSaving: false,
    onCreateCategory: vi.fn(async () => undefined),
    onSave: vi.fn(),
    onClose: vi.fn(),
    canSetHousehold: true,
    ...overrides,
  }
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

describe('EditTransactionDialog', () => {
  const restaurants = resolveCategory('restaurants').label
  const groceries = resolveCategory('groceries').label

  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('starts the draft from the transaction being edited', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    expect(screen.getByLabelText('Descripción edición')).toHaveValue('Disco')
    expect(screen.getByLabelText('Categoría dropdown')).toHaveTextContent(
      groceries
    )
    expect(screen.getByLabelText('Etiquetas dropdown')).toHaveTextContent(
      '1 etiqueta seleccionada'
    )
    expect(screen.getByLabelText('Solo esta transacción')).toBeChecked()
    expect(
      screen.getByText('Original: POS COMPRA DISCO 123')
    ).toBeInTheDocument()
  })

  it('saves the unchanged draft as it started', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    save()

    expect(props.onSave).toHaveBeenCalledWith({
      description: 'Disco',
      category: 'groceries',
      tags: ['super'],
      applyScope: 'single',
      household: null,
      householdTouched: false,
    })
  })

  it('saves the description, category, tags and scope the user chose', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: '  Disco Pocitos  ' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(screen.getByRole('button', { name: restaurants }))
    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.click(screen.getByRole('button', { name: 'viaje' }))
    fireEvent.click(screen.getByLabelText(/^Todas las similares/))
    save()

    expect(props.onSave).toHaveBeenCalledWith({
      description: 'Disco Pocitos',
      category: 'restaurants',
      tags: ['super', 'viaje'],
      applyScope: 'matching_past_and_future',
      household: null,
      householdTouched: false,
    })
  })

  it('saves the future-only scope when chosen', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'future_matching_only' })
    )
  })

  it('clears the category (null) when the user picks "sin categoría"', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveCategory('uncategorized').label,
      })
    )
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: null })
    )
  })

  it('refuses to save an empty description', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: '   ' },
    })
    save()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La descripción no puede quedar vacía'
    )
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('filters the category list by the search text', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: restaurants.slice(0, 5) },
    })

    expect(
      screen.getByRole('button', { name: restaurants })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: groceries })
    ).not.toBeInTheDocument()
  })

  it('selects a created category only once it is saved', async () => {
    const onCreateCategory = vi.fn(async () => ({ id: 'custom_mascotas' }))
    const props = baseProps({ onCreateCategory })
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: ' Mascotas ' },
    })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Crear categoría'))
    })
    save()

    expect(onCreateCategory).toHaveBeenCalledWith('Mascotas')
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'custom_mascotas' })
    )
  })

  it('keeps the category when creating one fails', async () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: 'Mascotas' },
    })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Crear categoría'))
    })
    save()

    expect(props.onCreateCategory).toHaveBeenCalledWith('Mascotas')
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'groceries' })
    )
  })

  it('creates and removes tags on the draft', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva etiqueta'), {
      target: { value: ' vacaciones ' },
    })
    fireEvent.click(screen.getByLabelText('Crear etiqueta'))
    fireEvent.click(screen.getByLabelText('Quitar etiqueta super'))
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['vacaciones'] })
    )
  })

  it('filters the tag list by the search text', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva etiqueta'), {
      target: { value: 'VIA' },
    })

    expect(screen.getByRole('button', { name: 'viaje' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'trabajo' })
    ).not.toBeInTheDocument()
  })

  it('tells how many transactions the similar scope reaches as the name changes', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    expect(
      screen.getByLabelText(/se aplica a 2 transacciones/)
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'POS COMPRA DISCO 123' },
    })

    expect(
      screen.getByLabelText(/se aplica a 4 transacciones/)
    ).toBeInTheDocument()
  })

  it('counts the similar reach as a rename only when the name differs from the original', () => {
    const countSimilar = vi.fn((_tx: Transaction, renamed: boolean) =>
      renamed ? 2 : 1
    )
    render(<EditTransactionDialog {...baseProps({ countSimilar })} />)

    // "Disco" differs from the raw "POS COMPRA DISCO 123".
    expect(countSimilar).toHaveBeenLastCalledWith(transaction, true)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'POS COMPRA DISCO 123' },
    })

    expect(countSimilar).toHaveBeenLastCalledWith(transaction, false)
    expect(
      screen.getByLabelText(
        'Todas las similares · solo esta por ahora (y las futuras)'
      )
    ).toBeInTheDocument()
  })

  it('starts a fresh draft for the next transaction', () => {
    const props = baseProps()
    const { rerender } = render(<EditTransactionDialog {...props} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Borrador' },
    })
    rerender(<EditTransactionDialog {...props} transaction={null} />)
    rerender(
      <EditTransactionDialog
        {...props}
        transaction={{
          ...transaction,
          id: 'tx-2',
          displayDescription: 'Tienda Inglesa',
        }}
      />
    )

    expect(screen.getByLabelText('Descripción edición')).toHaveValue(
      'Tienda Inglesa'
    )
  })

  it('starts a fresh draft when the same transaction is reopened', () => {
    const props = baseProps()
    const { rerender } = render(<EditTransactionDialog {...props} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Borrador' },
    })
    rerender(<EditTransactionDialog {...props} transaction={null} />)
    rerender(<EditTransactionDialog {...props} />)

    expect(screen.getByLabelText('Descripción edición')).toHaveValue('Disco')
  })

  it('keeps the draft while the open transaction is refreshed', () => {
    const props = baseProps()
    const { rerender } = render(<EditTransactionDialog {...props} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Borrador' },
    })
    rerender(
      <EditTransactionDialog {...props} transaction={{ ...transaction }} />
    )

    expect(screen.getByLabelText('Descripción edición')).toHaveValue('Borrador')
  })

  it('renders nothing editable without a transaction', () => {
    render(<EditTransactionDialog {...baseProps({ transaction: null })} />)

    expect(
      screen.queryByLabelText('Descripción edición')
    ).not.toBeInTheDocument()
  })

  it('blocks saving and cancelling while the save is pending', () => {
    render(<EditTransactionDialog {...baseProps({ isSaving: true })} />)

    expect(
      screen.getByRole('button', { name: 'Guardar cambios' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('closes from the cancel button without saving', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onSave).not.toHaveBeenCalled()
  })
})

describe('EditTransactionDialog — gasto del hogar (#251)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  const group = () => screen.getByRole('group', { name: /^Gasto del hogar/ })

  it('offers "Según categoría (sí)" selected for a row that follows Alimentación', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    expect(screen.getByLabelText('Según categoría (sí)')).toBeChecked()
    expect(screen.getByLabelText('Sí')).not.toBeChecked()
    expect(screen.getByLabelText('No')).not.toBeChecked()
    expect(group()).toBeInTheDocument()
  })

  it('saves a hand choice for this transaction only', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('No'))
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: false, applyScope: 'single' })
    )
  })

  it('opens on the row’s own choice and can go back to following the category', () => {
    const props = baseProps({
      transaction: { ...transaction, household: true },
    })
    render(<EditTransactionDialog {...props} />)

    expect(screen.getByLabelText('Sí')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Según categoría (sí)'))
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: null })
    )
  })

  it('keeps the choice out of the apply-scope', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Sí'))
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        household: true,
        householdTouched: true,
        applyScope: 'single',
      })
    )
  })

  describe('household rule scopes (#251, review 1)', () => {
    const rule = (value: boolean) =>
      putMerchantHouseholdRule(
        merchantOverrideKey(transaction.description) as string,
        value
      )

    beforeEach(() => clearHouseholdRules())

    it('a pick made under Solo esta is not a rule pick', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('Sí'))
      fireEvent.click(screen.getByLabelText(/^Todas las similares/))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          applyScope: 'matching_past_and_future',
          householdTouched: false,
        })
      )
    })

    it('choosing the option that is already shown still counts as a pick', () => {
      rule(true)
      const props = baseProps({
        transaction: { ...transaction, household: false },
      })
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText(/^Todas las similares/))
      expect(screen.getByLabelText('Sí')).toBeChecked()
      fireEvent.click(screen.getByLabelText('Sí'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ household: true, householdTouched: true })
      )
    })

    it('a rule pick does not follow the dialog back to Solo esta', () => {
      const props = baseProps({
        transaction: { ...transaction, household: false },
      })
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText(/^Todas las similares/))
      fireEvent.click(screen.getByLabelText('Sí'))
      fireEvent.click(screen.getByLabelText('Solo esta transacción'))

      // The row's own choice again, and nothing to write for it.
      expect(screen.getByLabelText('No')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          applyScope: 'single',
          household: false,
          householdTouched: false,
        })
      )
    })

    it('does not promise future rows where no rule can be made', () => {
      render(
        <EditTransactionDialog
          {...baseProps({
            transaction: { ...transaction, splitParentId: 'parent' },
          })}
        />
      )

      fireEvent.click(screen.getByLabelText(/^Todas las similares/))

      expect(screen.getByText(/Gasto del hogar/)).toHaveTextContent(
        'solo esta transacción'
      )
      expect(screen.getByText(/Gasto del hogar/)).not.toHaveTextContent(
        'futuras'
      )
    })

    it('counts the similar rows once, not on every keystroke', () => {
      const countHouseholdSimilar = vi.fn(() => 3)
      render(
        <EditTransactionDialog {...baseProps({ countHouseholdSimilar })} />
      )
      const calls = countHouseholdSimilar.mock.calls.length

      fireEvent.change(screen.getByLabelText('Descripción edición'), {
        target: { value: 'Disco Pocitos' },
      })

      expect(countHouseholdSimilar).toHaveBeenCalledTimes(calls)
    })
  })

  it('follows the dialog’s own category picker', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', { name: resolveCategory('restaurants').label })
    )
    expect(screen.getByLabelText('Según categoría (no)')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveCategory('uncategorized').label,
      })
    )
    expect(screen.getByLabelText('Según categoría (sin definir)')).toBeChecked()
  })

  it('has no group for income, ignored rows and split parents, and saves them untouched', () => {
    for (const row of [
      { ...transaction, type: 'credit' as const, category: 'income' },
      { ...transaction, category: 'internal_transfer' },
      { ...transaction, isSplitParent: true },
    ]) {
      const props = baseProps({ transaction: row })
      const { unmount } = render(<EditTransactionDialog {...props} />)

      expect(
        screen.queryByRole('group', { name: /^Gasto del hogar/ })
      ).toBeNull()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ household: null })
      )
      unmount()
    }
  })

  it('hides the group when the picked category is ignored, and writes no choice', () => {
    const props = baseProps({
      transaction: { ...transaction, household: true },
    })
    render(<EditTransactionDialog {...props} />)
    expect(screen.getByLabelText('Sí')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveCategory('internal_transfer').label,
      })
    )

    expect(screen.queryByRole('group', { name: /^Gasto del hogar/ })).toBeNull()
    save()
    // The row's own choice is left as it was: nothing to write.
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: true })
    )
  })

  it('shows the group once an ignored row is given a counted category', () => {
    const props = baseProps({
      transaction: { ...transaction, category: 'internal_transfer' },
    })
    render(<EditTransactionDialog {...props} />)
    expect(screen.queryByRole('group', { name: /^Gasto del hogar/ })).toBeNull()

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', { name: resolveCategory('groceries').label })
    )

    expect(screen.getByLabelText('Según categoría (sí)')).toBeChecked()
    fireEvent.click(screen.getByLabelText('No'))
    save()
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: false })
    )
  })

  it('has no group without a way to save it', () => {
    render(<EditTransactionDialog {...baseProps({ canSetHousehold: false })} />)

    expect(screen.queryByRole('group', { name: /^Gasto del hogar/ })).toBeNull()
  })
})
