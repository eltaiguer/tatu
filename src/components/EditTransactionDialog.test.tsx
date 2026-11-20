import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { Transaction } from '../models'
import { resolveCategory } from '../services/categories/category-registry'
import { replaceCustomCategories } from '../services/categories/category-store'
import { statementLabel } from '../services/merchants/merchant-key'
import { merchantOverrideKey } from '../services/categorizer/category-overrides'
import {
  clearHouseholdRules,
  putMerchantHouseholdRule,
} from '../services/household/household-rules-store'

type DialogProps = ComponentProps<typeof EditTransactionDialog>

const RAW =
  'COMPRA CON TARJETA DEBITO TINTORERIA MARTINIZI, MONTEVIDEO TARJ: ############9172'

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
    defaultToAll: () => true,
    countHouseholdSimilar: () => 3,
    knownTags: ['super', 'viaje', 'trabajo'],
    isSaving: false,
    onCreateCategory: vi.fn(async () => undefined),
    onSave: vi.fn(),
    onClose: vi.fn(),
    canSetHousehold: true,
    canSetHouseholdRule: true,
    ...overrides,
  }
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

// The "apply to" radio of the name and category (the Hogar choice has none).
const categoryScope = () =>
  within(screen.getByRole('group', { name: 'Aplicar nombre y categoría a' }))

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
    expect(
      categoryScope().getByLabelText('Solo esta transacción')
    ).toBeChecked()
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
      nameTouched: false,
      category: 'groceries',
      tags: ['super'],
      applyScope: 'single',
      household: { kind: 'none' },
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
    fireEvent.click(categoryScope().getByLabelText(/^Todas las similares/))
    save()

    expect(props.onSave).toHaveBeenCalledWith({
      description: 'Disco Pocitos',
      nameTouched: true,
      category: 'restaurants',
      tags: ['super', 'viaje'],
      applyScope: 'matching_past_and_future',
      household: { kind: 'none' },
    })
  })

  it('saves the future-only scope when chosen', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(
      categoryScope().getByLabelText('Esta y las que importes en el futuro')
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

    // The row's own name, untouched, is not a rename.
    expect(
      screen.getByLabelText(/se aplica a 4 transacciones/)
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Disco Pocitos' },
    })

    expect(
      screen.getByLabelText(/se aplica a 2 transacciones/)
    ).toBeInTheDocument()
  })

  it('counts the similar reach as a name write only when the name differs from the one opened', () => {
    const countSimilar = vi.fn((_tx: Transaction, renamed: boolean) =>
      renamed ? 2 : 1
    )
    render(<EditTransactionDialog {...baseProps({ countSimilar })} />)

    // "Disco" is the row's own name, as opened: untouched.
    expect(countSimilar).toHaveBeenLastCalledWith(transaction, false)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Disco Pocitos' },
    })
    expect(countSimilar).toHaveBeenLastCalledWith(transaction, true)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'POS COMPRA DISCO 123' },
    })

    // The statement text is a touched name: under Todas it clears every
    // similar row's name, as a rename does.
    expect(countSimilar).toHaveBeenLastCalledWith(transaction, true)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Disco' },
    })
    expect(countSimilar).toHaveBeenLastCalledWith(transaction, false)
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

describe('EditTransactionDialog — Hogar (#251)', () => {
  beforeEach(() => {
    replaceCustomCategories([])
    clearHouseholdRules()
  })

  const group = () => screen.getByRole('group', { name: /^Hogar/ })

  describe('the "Ahora:" line (#265)', () => {
    const now = () => screen.queryByText(/^Ahora:/)
    const pickCategory = (id: string) => {
      fireEvent.click(screen.getByLabelText('Categoría dropdown'))
      fireEvent.click(
        screen.getByRole('button', { name: resolveCategory(id).label })
      )
    }

    it('says what the row is now and why, as the Hogar group description', () => {
      render(<EditTransactionDialog {...baseProps()} />)

      expect(now()).toHaveTextContent('Ahora: Hogar · según Alimentación')
      expect(group()).toHaveAccessibleName('Hogar')
      expect(group()).toHaveAccessibleDescription(
        'Ahora: Hogar · según Alimentación'
      )
    })

    it('says "elegido a mano" for the row’s own choice', () => {
      render(
        <EditTransactionDialog
          {...baseProps({ transaction: { ...transaction, household: false } })}
        />
      )

      expect(now()).toHaveTextContent('Ahora: No es del hogar · elegido a mano')
    })

    it('says "según comercio" for a row a merchant rule covers', () => {
      putMerchantHouseholdRule(
        merchantOverrideKey(transaction.description) as string,
        true
      )
      render(<EditTransactionDialog {...baseProps()} />)

      expect(now()).toHaveTextContent('Ahora: Hogar · según comercio')
    })

    it('describes the saved row, not the draft', () => {
      render(<EditTransactionDialog {...baseProps()} />)

      fireEvent.click(screen.getByLabelText('No'))
      pickCategory('restaurants')

      expect(now()).toHaveTextContent('Ahora: Hogar · según Alimentación')
    })

    it('follows a rule saved while the dialog is open', () => {
      render(<EditTransactionDialog {...baseProps()} />)
      expect(now()).toHaveTextContent('Ahora: Hogar · según Alimentación')

      act(() => {
        putMerchantHouseholdRule(
          merchantOverrideKey(transaction.description) as string,
          false
        )
      })

      expect(now()).toHaveTextContent('Ahora: No es del hogar · según comercio')
    })

    it('has no line when the saved row is not a counted expense', () => {
      render(
        <EditTransactionDialog
          {...baseProps({
            transaction: { ...transaction, category: 'internal_transfer' },
          })}
        />
      )
      pickCategory('groceries')

      expect(group()).toBeInTheDocument()
      expect(now()).toBeNull()
    })
  })

  it('offers "Según categoría (Sí)" selected for a row that follows Alimentación', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    expect(screen.getByLabelText('Según categoría (Sí)')).toBeChecked()
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
      expect.objectContaining({
        household: { kind: 'row', household: false },
        applyScope: 'single',
      })
    )
  })

  it('opens on the row’s own choice and can go back to following the category', () => {
    const props = baseProps({
      transaction: { ...transaction, household: true },
    })
    render(<EditTransactionDialog {...props} />)

    expect(screen.getByLabelText('Sí')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Según categoría (Sí)'))
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: { kind: 'row', household: null } })
    )
  })

  describe('the "Recordar para todas las de …" checkbox (ADR-0007)', () => {
    const rule = (value: boolean) =>
      putMerchantHouseholdRule(
        merchantOverrideKey(transaction.description) as string,
        value
      )
    const box = () =>
      screen.queryByRole('checkbox', { name: /^Recordar para todas las de/ })
    const hogar = (written: object) =>
      expect.objectContaining({ household: written })
    const pickCategory = (id: string) => {
      fireEvent.click(screen.getByLabelText('Categoría dropdown'))
      fireEvent.click(
        screen.getByRole('button', { name: resolveCategory(id).label })
      )
    }

    beforeEach(() => clearHouseholdRules())

    it('no rule: the box is unchecked, named after the merchant, with the reach as a hint', () => {
      render(<EditTransactionDialog {...baseProps()} />)

      expect(
        screen.getByRole('checkbox', {
          name: 'Recordar para todas las de Disco',
        })
      ).not.toBeChecked()
      expect(
        screen.getByText('Se aplica a 3 transacciones y a las que importes')
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Según categoría (Sí)')).toBeChecked()
      // The reach is not on the legend.
      expect(within(group()).getByText(/^Hogar/)).not.toHaveTextContent('·')
    })

    it('opens an un-renamed bank row with its clean label and keeps the statement text under Original (#274, #296)', () => {
      const onSave = vi.fn()
      render(
        <EditTransactionDialog
          {...baseProps({
            transaction: {
              ...transaction,
              description: RAW,
              displayDescription: undefined,
            },
            onSave,
          })}
        />
      )

      expect(
        screen.getByRole('checkbox', {
          name: 'Recordar para todas las de Tintoreria Martinizi',
        })
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Descripción edición')).toHaveValue(
        'Tintoreria Martinizi'
      )
      expect(screen.getByText(`Original: ${RAW}`)).toBeInTheDocument()
    })

    it('opens an un-renamed transfer row with its row label, never the group form (#296)', () => {
      const desc = 'TRANSFERENCIA ENVIADA 7972TT55 TRF. PLAZA- FEDERICO GAZZANO'
      render(
        <EditTransactionDialog
          {...baseProps({
            transaction: {
              ...transaction,
              description: desc,
              displayDescription: undefined,
            },
          })}
        />
      )

      const input = screen.getByLabelText('Descripción edición')
      expect(input).toHaveValue('FEDERICO GAZZANO · Transferencia enviada')
      expect(input).toHaveValue(statementLabel(desc))
    })

    it('opens a row whose AI name equals the statement text with the clean label (#296)', () => {
      render(
        <EditTransactionDialog
          {...baseProps({
            transaction: {
              ...transaction,
              description: RAW,
              displayDescription: RAW,
            },
          })}
        />
      )

      expect(screen.getByLabelText('Descripción edición')).toHaveValue(
        'Tintoreria Martinizi'
      )
    })

    it('counts a touched name against the opened label: only the opened label typed back is untouched (#296)', () => {
      const countSimilar = vi.fn((_tx: Transaction, renamed: boolean) =>
        renamed ? 2 : 4
      )
      const tx = {
        ...transaction,
        description: RAW,
        displayDescription: undefined,
      }
      render(
        <EditTransactionDialog
          {...baseProps({ transaction: tx, countSimilar })}
        />
      )
      const type = (value: string) =>
        fireEvent.change(screen.getByLabelText('Descripción edición'), {
          target: { value },
        })

      expect(countSimilar).toHaveBeenLastCalledWith(tx, false)
      type('Lavadero Martinizi')
      expect(countSimilar).toHaveBeenLastCalledWith(tx, true)
      type('Tintoreria Martinizi')
      expect(countSimilar).toHaveBeenLastCalledWith(tx, false)
      // The statement text is a touched name: the write reaches the same rows
      // (it clears names and the override), so the count says so.
      type(RAW)
      expect(countSimilar).toHaveBeenLastCalledWith(tx, true)
      type('Tintoreria Martinizi')
      expect(countSimilar).toHaveBeenLastCalledWith(tx, false)
    })

    it('counts the clean label typed over another own name: the write reaches every similar row (#296)', () => {
      const countSimilar = vi.fn((_tx: Transaction, renamed: boolean) =>
        renamed ? 2 : 4
      )
      const tx = { ...transaction, description: RAW, displayDescription: 'Foo' }
      render(
        <EditTransactionDialog
          {...baseProps({ transaction: tx, countSimilar })}
        />
      )

      expect(countSimilar).toHaveBeenLastCalledWith(tx, false)
      fireEvent.change(screen.getByLabelText('Descripción edición'), {
        target: { value: 'Tintoreria Martinizi' },
      })
      expect(countSimilar).toHaveBeenLastCalledWith(tx, true)
    })

    it('says whether the name was touched in the draft, decided once (#296)', () => {
      const onSave = vi.fn()
      const tx = {
        ...transaction,
        description: RAW,
        displayDescription: undefined,
      }
      render(
        <EditTransactionDialog {...baseProps({ transaction: tx, onSave })} />
      )
      const type = (value: string) =>
        fireEvent.change(screen.getByLabelText('Descripción edición'), {
          target: { value },
        })

      save()
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ nameTouched: false })
      )
      type('Lavadero Martinizi')
      save()
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({
          nameTouched: true,
          description: 'Lavadero Martinizi',
        })
      )
      type('  Tintoreria Martinizi ')
      save()
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ nameTouched: false })
      )
      type(RAW)
      save()
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ nameTouched: true, description: RAW })
      )
    })

    it('saves an untouched bank row with its clean label as the draft name (#296)', () => {
      const onSave = vi.fn()
      render(
        <EditTransactionDialog
          {...baseProps({
            transaction: {
              ...transaction,
              description: RAW,
              displayDescription: undefined,
            },
            onSave,
          })}
        />
      )

      save()

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Tintoreria Martinizi' })
      )
    })

    it('says "solo esta por ahora" when the merchant has no other row', () => {
      render(
        <EditTransactionDialog
          {...baseProps({ countHouseholdSimilar: () => 1 })}
        />
      )

      expect(
        screen.getByText('Por ahora solo esta, y las que importes')
      ).toBeInTheDocument()
    })

    it('no rule: nothing touched saves no Hogar write', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      save()

      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it("no rule: a Sí for this row is saved as the row's own choice", () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('Sí'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'row', household: true })
      )
    })

    it('no rule: checking the box with Sí saves the rule', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('Sí'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'rule', household: true })
      )
    })

    it('no rule: checking the box with No saves a No rule', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('No'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'rule', household: false })
      )
    })

    it('checking over "Según categoría" preselects what the row shows, hides "Según categoría", and saves that as the rule', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)

      expect(box()).toBeChecked()
      expect(screen.getByLabelText('Sí')).toBeChecked()
      expect(screen.queryByLabelText(/^Según/)).toBeNull()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'rule', household: true })
      )
    })

    it('the preselect follows the category being picked', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      pickCategory('restaurants')
      fireEvent.click(box()!)

      expect(screen.getByLabelText('No')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'restaurants',
          household: { kind: 'rule', household: false },
        })
      )
    })

    it('checking then unchecking without a pick writes nothing', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(box()!)

      expect(screen.getByLabelText('Según categoría (Sí)')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it("a pick made while checked stays on screen after unchecking, as the row's own", () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('No'))
      fireEvent.click(box()!)

      expect(screen.getByLabelText('No')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'row', household: false })
      )
    })

    it('rechecking after picking "Según categoría" preselects what the row shows, not the earlier pick', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('No'))
      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('Según categoría (Sí)'))
      fireEvent.click(box()!)

      expect(screen.getByLabelText('Sí')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'rule', household: true })
      )
    })

    it('a rule covers the row: the box starts checked on the rule\'s value, without "Según categoría"', () => {
      rule(false)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      expect(box()).toBeChecked()
      expect(screen.getByLabelText('No')).toBeChecked()
      expect(screen.queryByLabelText(/^Según/)).toBeNull()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('a rule covers the row: switching Sí/No saves the rule', () => {
      rule(false)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('Sí'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'rule', household: true })
      )
    })

    it('a rule covers the row: re-picking the value shown is no change, so it writes nothing', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('Sí'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('uncheck, pick the rule’s own value, recheck: still no change', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('Sí'))
      fireEvent.click(box()!)

      expect(box()).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('a rule-covered row opened in an ignored category and moved to a counted one is still decided by its rule', () => {
      rule(true)
      const props = baseProps({
        transaction: { ...transaction, category: 'internal_transfer' },
      })
      render(<EditTransactionDialog {...props} />)
      expect(box()).toBeNull()

      pickCategory('groceries')

      expect(box()).toBeChecked()
      expect(screen.getByLabelText('Sí')).toBeChecked()
      expect(screen.queryByLabelText(/^Según/)).toBeNull()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('after unchecking a box that started checked, the hint says the rule is dropped on save', () => {
      rule(true)
      render(<EditTransactionDialog {...baseProps()} />)
      expect(
        screen.getByText('Se aplica a 3 transacciones y a las que importes')
      ).toBeInTheDocument()

      fireEvent.click(box()!)

      expect(
        screen.getByText('Al guardar, se deja de recordar')
      ).toBeInTheDocument()
      fireEvent.click(box()!)
      expect(
        screen.getByText('Se aplica a 3 transacciones y a las que importes')
      ).toBeInTheDocument()
    })

    it('a rule covers the row: unchecking forgets the rule and keeps the value on screen', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)

      expect(box()).not.toBeChecked()
      expect(screen.getByLabelText('Sí')).toBeChecked()
      // The rule goes with this save: the follow option is the category's.
      expect(screen.getByLabelText('Según categoría (Sí)')).toBeInTheDocument()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'forget', household: true })
      )
    })

    it('after unchecking, "Según categoría" is offered again and picking it forgets the rule with null', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(screen.getByLabelText('Según categoría (Sí)'))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'forget', household: null })
      )
    })

    it('a switch made while checked is the value kept after unchecking', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('No'))
      fireEvent.click(box()!)

      expect(screen.getByLabelText('No')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'forget', household: false })
      )
    })

    it('unchecking then rechecking without a pick writes nothing', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(box()!)
      fireEvent.click(box()!)

      expect(box()).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('a rule written while the dialog is open does not flip the box', () => {
      const props = baseProps()
      const { rerender } = render(<EditTransactionDialog {...props} />)

      act(() => rule(true))
      rerender(<EditTransactionDialog {...props} />)

      expect(box()).not.toBeChecked()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('a row whose own choice contradicts the rule starts unchecked on its own choice, offering "Según comercio" (the rule is not deleted by leaving it)', () => {
      rule(true)
      const props = baseProps({
        transaction: { ...transaction, household: false },
      })
      render(<EditTransactionDialog {...props} />)

      expect(box()).not.toBeChecked()
      expect(screen.getByLabelText('No')).toBeChecked()
      expect(screen.getByLabelText('Según comercio (Sí)')).toBeInTheDocument()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('a contradicting row: "Según comercio" saves the row following the rule, and checking makes its own value the rule', () => {
      rule(true)
      const props = baseProps({
        transaction: { ...transaction, household: false },
      })
      const { unmount } = render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('Según comercio (Sí)'))
      save()
      expect(props.onSave).toHaveBeenLastCalledWith(
        hogar({ kind: 'row', household: null })
      )
      unmount()

      render(<EditTransactionDialog {...props} />)
      fireEvent.click(box()!)
      expect(screen.getByLabelText('No')).toBeChecked()
      save()
      expect(props.onSave).toHaveBeenLastCalledWith(
        hogar({ kind: 'rule', household: false })
      )
    })

    it('no box for a split part or a row with no merchant key; the legend says "solo esta transacción"', () => {
      for (const row of [
        { ...transaction, splitParentId: 'parent' },
        { ...transaction, description: '' },
      ]) {
        const props = baseProps({ transaction: row })
        const { unmount } = render(<EditTransactionDialog {...props} />)

        expect(box()).toBeNull()
        expect(within(group()).getByText(/^Hogar/)).toHaveTextContent(
          'solo esta transacción'
        )
        fireEvent.click(screen.getByLabelText('Sí'))
        save()
        expect(props.onSave).toHaveBeenCalledWith(
          hogar({ kind: 'row', household: true })
        )
        unmount()
      }
    })

    it('no box when the view cannot save rules', () => {
      const props = baseProps({ canSetHouseholdRule: false })
      render(<EditTransactionDialog {...props} />)

      expect(box()).toBeNull()
      expect(within(group()).getByText(/^Hogar/)).toHaveTextContent(
        'solo esta transacción'
      )
      fireEvent.click(screen.getByLabelText('Sí'))
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        hogar({ kind: 'row', household: true })
      )
    })

    it('the box follows the category being picked: hidden on an ignored category, and nothing written', () => {
      rule(true)
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)
      expect(box()).toBeChecked()

      pickCategory('internal_transfer')

      expect(box()).toBeNull()
      save()
      expect(props.onSave).toHaveBeenCalledWith(hogar({ kind: 'none' }))
    })

    it('the reach follows the category being picked, not the saved one', () => {
      // The similar rows depend on the draft row: Alimentación (as saved)
      // reaches 2, Restaurantes reaches 5.
      const countHouseholdSimilar = (tx: Transaction) =>
        tx.category === 'restaurants' ? 5 : 2
      render(
        <EditTransactionDialog {...baseProps({ countHouseholdSimilar })} />
      )
      expect(
        screen.getByText('Se aplica a 2 transacciones y a las que importes')
      ).toBeInTheDocument()

      pickCategory('restaurants')

      expect(
        screen.getByText('Se aplica a 5 transacciones y a las que importes')
      ).toBeInTheDocument()
    })

    it('the category radio is unchanged, and category "Solo esta" + remember come in one draft', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      expect(
        categoryScope().getByLabelText('Solo esta transacción')
      ).toBeChecked()
      pickCategory('restaurants')
      // The category changed, so the default is now Todas: this test is about
      // "Solo esta", chosen by hand.
      fireEvent.click(categoryScope().getByLabelText('Solo esta transacción'))
      fireEvent.click(box()!)
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'restaurants',
          applyScope: 'single',
          household: { kind: 'rule', household: false },
        })
      )
    })

    it('the category scope leaves the Hogar choice for this row only', () => {
      const props = baseProps()
      render(<EditTransactionDialog {...props} />)

      fireEvent.click(screen.getByLabelText('Sí'))
      fireEvent.click(categoryScope().getByLabelText(/^Todas las similares/))
      save()

      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          applyScope: 'matching_past_and_future',
          household: { kind: 'row', household: true },
        })
      )
    })

    it('has no "Aplicar “gasto del hogar” a" group', () => {
      render(<EditTransactionDialog {...baseProps()} />)

      expect(
        screen.queryByRole('group', { name: 'Aplicar “gasto del hogar” a' })
      ).toBeNull()
    })
  })

  it('follows the dialog’s own category picker', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', { name: resolveCategory('restaurants').label })
    )
    expect(screen.getByLabelText('Según categoría (No)')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', {
        name: resolveCategory('uncategorized').label,
      })
    )
    expect(screen.getByLabelText('Según categoría (No)')).toBeChecked()
  })

  it('has no group for income, ignored rows and split parents, and saves them untouched', () => {
    for (const row of [
      { ...transaction, type: 'credit' as const, category: 'income' },
      { ...transaction, category: 'internal_transfer' },
      { ...transaction, isSplitParent: true },
    ]) {
      const props = baseProps({ transaction: row })
      const { unmount } = render(<EditTransactionDialog {...props} />)

      expect(screen.queryByRole('group', { name: /^Hogar/ })).toBeNull()
      expect(
        screen.queryByRole('checkbox', { name: /^Recordar para todas las de/ })
      ).toBeNull()
      save()
      expect(props.onSave).toHaveBeenCalledWith(
        expect.objectContaining({ household: { kind: 'none' } })
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

    expect(screen.queryByRole('group', { name: /^Hogar/ })).toBeNull()
    save()
    // The row's own choice is left as it was: nothing to write.
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: { kind: 'none' } })
    )
  })

  it('shows the group once an ignored row is given a counted category', () => {
    const props = baseProps({
      transaction: { ...transaction, category: 'internal_transfer' },
    })
    render(<EditTransactionDialog {...props} />)
    expect(screen.queryByRole('group', { name: /^Hogar/ })).toBeNull()

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(
      screen.getByRole('button', { name: resolveCategory('groceries').label })
    )

    expect(screen.getByLabelText('Según categoría (Sí)')).toBeChecked()
    fireEvent.click(screen.getByLabelText('No'))
    save()
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ household: { kind: 'row', household: false } })
    )
  })

  it('has no group without a way to save it', () => {
    render(<EditTransactionDialog {...baseProps({ canSetHousehold: false })} />)

    expect(screen.queryByRole('group', { name: /^Hogar/ })).toBeNull()
    expect(
      screen.queryByRole('checkbox', { name: /^Recordar para todas las de/ })
    ).toBeNull()
  })
})

describe('EditTransactionDialog — default scope (#281)', () => {
  const restaurants = resolveCategory('restaurants').label
  const groceries = resolveCategory('groceries').label
  const transport = resolveCategory('transport').label
  const all = /^Todas las similares · se aplica a 4 transacciones/
  const pick = (label: string) => {
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(screen.getByRole('button', { name: label }))
  }

  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('pre-selects Todas las similares once the category changes', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    pick(restaurants)

    expect(categoryScope().getByLabelText(all)).toBeChecked()
    save()
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })
    )
  })

  it('keeps Solo esta when the merchant has no other rows', () => {
    const props = baseProps({ defaultToAll: () => false })
    render(<EditTransactionDialog {...props} />)

    pick(restaurants)

    expect(
      categoryScope().getByLabelText('Solo esta transacción')
    ).toBeChecked()
    save()
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'single' })
    )
  })

  it('keeps Solo esta for a split part', () => {
    const props = baseProps({
      transaction: { ...transaction, splitParentId: 'p' },
    })
    render(<EditTransactionDialog {...props} />)

    pick(restaurants)
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'single' })
    )
  })

  it('keeps Solo esta for a split parent', () => {
    const props = baseProps({
      transaction: { ...transaction, isSplitParent: true },
    })
    render(<EditTransactionDialog {...props} />)

    pick(restaurants)
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'single' })
    )
  })

  it('goes back to Solo esta when the original category is put back', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    pick(restaurants)
    pick(groceries)

    expect(
      categoryScope().getByLabelText('Solo esta transacción')
    ).toBeChecked()
  })

  it('keeps the user’s own choice when the category changes again', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    pick(restaurants)
    fireEvent.click(categoryScope().getByLabelText('Solo esta transacción'))
    pick(transport)
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'transport', applyScope: 'single' })
    )
  })

  it('keeps Solo esta for a rename alone', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Disco Pocitos' },
    })
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'single' })
    )
  })

  it('keeps Solo esta for a tags-only save', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.click(screen.getByRole('button', { name: 'viaje' }))
    save()

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ applyScope: 'single' })
    )
  })
})
