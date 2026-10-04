import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { ComponentProps } from 'react'
import { EditTransactionDialog } from './EditTransactionDialog'
import type { Transaction } from '../models'
import { getCategoryDisplay } from '../utils/category-display'
import { replaceCustomCategories } from '../services/categories/category-store'

type DialogProps = ComponentProps<typeof EditTransactionDialog>
type ApplyScope = DialogProps['applyScope']

const transaction: Transaction = {
  id: 'tx-1',
  date: new Date('2025-03-10T12:00:00'),
  description: 'POS COMPRA DISCO 123',
  amount: 100,
  currency: 'USD',
  type: 'debit',
  source: 'bank_account',
  category: 'groceries',
  rawData: {},
}

function baseProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    editingTransaction: transaction,
    editDescription: 'Disco',
    editCategory: 'groceries',
    editTagList: [],
    applyScope: 'single',
    editError: '',
    categoryPickerOpen: false,
    tagPickerOpen: false,
    newCategoryInput: '',
    newTagInput: '',
    filteredCategorySuggestions: ['groceries', 'restaurants'],
    filteredTagSuggestions: [],
    pendingTransactionIds: new Set<string>(),
    similarCount: 4,
    onDescriptionChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onApplyScopeChange: vi.fn(),
    onCategoryPickerOpenChange: vi.fn(),
    onTagPickerOpenChange: vi.fn(),
    onNewCategoryInputChange: vi.fn(),
    onNewTagInputChange: vi.fn(),
    onAddCategory: vi.fn(),
    onAddTag: vi.fn(),
    onAddInlineTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

interface SavedEdit {
  description: string
  category: string
  scope: ApplyScope
}

// Owns the dialog's state the way Transactions does, and records what that
// state is at the moment the user saves — i.e. what the save handler sends.
function StatefulDialog({ onSave }: { onSave: (edit: SavedEdit) => void }) {
  const [description, setDescription] = useState('Disco')
  const [category, setCategory] = useState('groceries')
  const [scope, setScope] = useState<ApplyScope>('single')
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <EditTransactionDialog
      {...baseProps()}
      editDescription={description}
      editCategory={category}
      applyScope={scope}
      categoryPickerOpen={pickerOpen}
      onDescriptionChange={setDescription}
      onCategoryChange={setCategory}
      onApplyScopeChange={setScope}
      onCategoryPickerOpenChange={setPickerOpen}
      onSave={() => onSave({ description, category, scope })}
    />
  )
}

describe('EditTransactionDialog', () => {
  const restaurants = getCategoryDisplay('restaurants').label

  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('saves the description, category and scope the user chose', () => {
    const onSave = vi.fn()
    render(<StatefulDialog onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Disco Pocitos' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.click(screen.getByRole('button', { name: restaurants }))
    fireEvent.click(screen.getByLabelText(/^Todas las similares/))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onSave).toHaveBeenCalledWith({
      description: 'Disco Pocitos',
      category: 'restaurants',
      scope: 'matching_past_and_future',
    })
  })

  it('saves the future-only scope when chosen', () => {
    const onSave = vi.fn()
    render(<StatefulDialog onSave={onSave} />)

    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'future_matching_only' })
    )
  })

  it('reports each scope option as the exact scope value', () => {
    const props = baseProps({ applyScope: 'matching_past_and_future' })
    render(<EditTransactionDialog {...props} />)

    expect(screen.getByLabelText(/^Todas las similares/)).toBeChecked()

    fireEvent.click(screen.getByLabelText('Solo esta transacción'))
    expect(props.onApplyScopeChange).toHaveBeenLastCalledWith('single')

    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    expect(props.onApplyScopeChange).toHaveBeenLastCalledWith(
      'future_matching_only'
    )
  })

  it('reports the picked category and closes the picker', () => {
    const props = baseProps({ categoryPickerOpen: true })
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: restaurants }))

    expect(props.onCategoryChange).toHaveBeenCalledWith('restaurants')
    expect(props.onCategoryPickerOpenChange).toHaveBeenCalledWith(false)
  })

  it('tells how many transactions the similar scope reaches', () => {
    render(<EditTransactionDialog {...baseProps({ similarCount: 4 })} />)

    expect(
      screen.getByLabelText(/se aplica a 4 transacciones/)
    ).toBeInTheDocument()
  })

  it('shows the transaction being edited and its original description', () => {
    render(<EditTransactionDialog {...baseProps()} />)

    expect(
      screen.getByText('Original: POS COMPRA DISCO 123')
    ).toBeInTheDocument()
  })

  it('shows a save error', () => {
    render(
      <EditTransactionDialog
        {...baseProps({ editError: 'No se pudo guardar' })}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
  })

  it('blocks saving and cancelling while the save is pending', () => {
    const props = baseProps({ pendingTransactionIds: new Set(['tx-1']) })
    render(<EditTransactionDialog {...props} />)

    expect(
      screen.getByRole('button', { name: 'Guardar cambios' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('cancels from the cancel button', () => {
    const props = baseProps()
    render(<EditTransactionDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(props.onSave).not.toHaveBeenCalled()
  })
})
