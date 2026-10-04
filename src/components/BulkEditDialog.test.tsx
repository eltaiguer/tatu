import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ComponentProps } from 'react'
import { BulkEditDialog } from './BulkEditDialog'
import { getCategoryDisplay } from '../utils/category-display'
import { replaceCustomCategories } from '../services/categories/category-store'

type DialogProps = ComponentProps<typeof BulkEditDialog>

function baseProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    open: true,
    selectionCount: 3,
    bulkEditCategory: '',
    bulkEditTagList: [],
    bulkCategoryPickerOpen: false,
    bulkTagPickerOpen: false,
    bulkCategorySearch: '',
    bulkTagSearch: '',
    categorySuggestions: ['groceries', 'restaurants'],
    tagSuggestions: ['viaje', 'trabajo'],
    isBulkOperating: false,
    showCategorySection: true,
    showTagSection: true,
    onBulkEditCategoryChange: vi.fn(),
    onBulkEditTagListChange: vi.fn(),
    onBulkCategoryPickerOpenChange: vi.fn(),
    onBulkTagPickerOpenChange: vi.fn(),
    onBulkCategorySearchChange: vi.fn(),
    onBulkTagSearchChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

interface SavedBulkEdit {
  category: string
  tags: string[]
}

// Owns the dialog's state the way Transactions does, and records what that
// state is at the moment the user saves.
function StatefulDialog({ onSave }: { onSave: (edit: SavedBulkEdit) => void }) {
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')

  return (
    <BulkEditDialog
      {...baseProps()}
      bulkEditCategory={category}
      bulkEditTagList={tags}
      bulkCategoryPickerOpen={categoryPickerOpen}
      bulkTagPickerOpen={tagPickerOpen}
      bulkTagSearch={tagSearch}
      bulkCategorySearch={categorySearch}
      onBulkCategorySearchChange={setCategorySearch}
      onBulkEditCategoryChange={setCategory}
      onBulkEditTagListChange={setTags}
      onBulkCategoryPickerOpenChange={setCategoryPickerOpen}
      onBulkTagPickerOpenChange={setTagPickerOpen}
      onBulkTagSearchChange={setTagSearch}
      onSave={() => onSave({ category, tags })}
    />
  )
}

describe('BulkEditDialog', () => {
  const restaurants = getCategoryDisplay('restaurants').label

  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('says how many transactions will be edited', () => {
    render(<BulkEditDialog {...baseProps({ selectionCount: 3 })} />)

    expect(
      screen.getByRole('dialog', { name: /^Editar 3 transacci/ })
    ).toBeInTheDocument()
  })

  it('uses the singular for a single transaction', () => {
    render(<BulkEditDialog {...baseProps({ selectionCount: 1 })} />)

    expect(
      screen.getByRole('dialog', { name: 'Editar 1 transacción' })
    ).toBeInTheDocument()
  })

  it('spells the plural without the singular accent', () => {
    render(<BulkEditDialog {...baseProps({ selectionCount: 3 })} />)

    expect(
      screen.getByRole('dialog', { name: 'Editar 3 transacciones' })
    ).toBeInTheDocument()
  })

  it('saves the category the user picked', () => {
    const onSave = vi.fn()
    render(<StatefulDialog onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /^Categoría/ }))
    fireEvent.click(screen.getByRole('button', { name: restaurants }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onSave).toHaveBeenCalledWith({ category: 'restaurants', tags: [] })
  })

  it('saves picked and newly created tags', () => {
    const onSave = vi.fn()
    render(<StatefulDialog onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /^Etiquetas/ }))
    fireEvent.click(screen.getByRole('button', { name: '#viaje' }))
    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: '  vacaciones ' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Crear etiqueta "vacaciones"' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onSave).toHaveBeenCalledWith({
      category: '',
      tags: ['viaje', 'vacaciones'],
    })
  })

  it('reports the picked category and closes the picker', () => {
    const props = baseProps({ bulkCategoryPickerOpen: true })
    render(<BulkEditDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: restaurants }))

    expect(props.onBulkEditCategoryChange).toHaveBeenCalledWith('restaurants')
    expect(props.onBulkCategoryPickerOpenChange).toHaveBeenCalledWith(false)
  })

  it('lets the user go back to leaving the category unchanged', () => {
    const props = baseProps({
      bulkCategoryPickerOpen: true,
      bulkEditCategory: 'groceries',
    })
    render(<BulkEditDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sin cambios' }))

    expect(props.onBulkEditCategoryChange).toHaveBeenCalledWith('')
  })

  it('toggles off a tag that was already picked', () => {
    const props = baseProps({
      bulkTagPickerOpen: true,
      bulkEditTagList: ['viaje', 'trabajo'],
    })
    render(<BulkEditDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '#viaje ✓' }))

    expect(props.onBulkEditTagListChange).toHaveBeenCalledWith(['trabajo'])
  })

  it('removes a picked tag from its chip', () => {
    const props = baseProps({ bulkEditTagList: ['viaje', 'trabajo'] })
    render(<BulkEditDialog {...props} />)

    fireEvent.click(screen.getByLabelText('Quitar etiqueta viaje'))

    expect(props.onBulkEditTagListChange).toHaveBeenCalledWith(['trabajo'])
  })

  it('does not allow saving when nothing would change', () => {
    render(<BulkEditDialog {...baseProps()} />)

    expect(
      screen.getByRole('button', { name: 'Guardar cambios' })
    ).toBeDisabled()
  })

  it('blocks saving and cancelling while the bulk edit runs', () => {
    render(
      <BulkEditDialog
        {...baseProps({ bulkEditCategory: 'groceries', isBulkOperating: true })}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Guardar cambios' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('lists only the categories matching the search', () => {
    render(
      <BulkEditDialog
        {...baseProps({
          bulkCategoryPickerOpen: true,
          bulkCategorySearch: restaurants.slice(0, 5).toUpperCase(),
        })}
      />
    )

    expect(
      screen.getByRole('button', { name: restaurants })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: getCategoryDisplay('groceries').label,
      })
    ).not.toBeInTheDocument()
  })

  it('lists only the tags matching the search', () => {
    render(
      <BulkEditDialog
        {...baseProps({ bulkTagPickerOpen: true, bulkTagSearch: 'VIA' })}
      />
    )

    expect(screen.getByRole('button', { name: '#viaje' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '#trabajo' })
    ).not.toBeInTheDocument()
  })

  it('names each picker by its visible label and current value', () => {
    render(
      <BulkEditDialog
        {...baseProps({
          bulkEditCategory: 'restaurants',
          bulkEditTagList: ['viaje'],
        })}
      />
    )

    expect(
      screen.getByRole('button', { name: `Categoría ${restaurants}` })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Etiquetas 1 etiqueta a agregar' })
    ).toBeInTheDocument()
  })

  describe('keyboard', () => {
    it('adds a new tag typed in the search with Enter', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<StatefulDialog onSave={onSave} />)

      await user.click(screen.getByRole('button', { name: /^Etiquetas/ }))
      await user.type(
        screen.getByLabelText('Buscar o crear etiqueta'),
        'vacaciones{Enter}'
      )

      expect(
        screen.getByRole('button', { name: 'Quitar etiqueta vacaciones' })
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Buscar o crear etiqueta')).toHaveValue('')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(onSave).toHaveBeenCalledWith({
        category: '',
        tags: ['vacaciones'],
      })
    })

    it('adds an existing tag typed in the search with Enter, once', async () => {
      const user = userEvent.setup()
      render(<StatefulDialog onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /^Etiquetas/ }))
      const search = screen.getByLabelText('Buscar o crear etiqueta')
      await user.type(search, 'viaje{Enter}')
      await user.type(search, 'viaje{Enter}')

      expect(
        screen.getAllByRole('button', { name: 'Quitar etiqueta viaje' })
      ).toHaveLength(1)
    })

    it('picks the first matching category with Enter', async () => {
      const user = userEvent.setup()
      render(<StatefulDialog onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /^Categoría/ }))
      await user.type(
        screen.getByLabelText('Buscar categoría'),
        restaurants.slice(0, 4) + '{Enter}'
      )

      await waitFor(() =>
        expect(screen.queryByLabelText('Buscar categoría')).toBeNull()
      )
      expect(
        screen.getByRole('button', { name: `Categoría ${restaurants}` })
      ).toBeInTheDocument()
    })

    it('moves from the category search into the list with ArrowDown', async () => {
      const user = userEvent.setup()
      render(<StatefulDialog onSave={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: /^Categoría/ }))
      await user.type(
        screen.getByLabelText('Buscar categoría'),
        restaurants.slice(0, 4)
      )
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{ArrowDown}')
      expect(screen.getByRole('button', { name: restaurants })).toHaveFocus()
      await user.keyboard('{Enter}')

      expect(
        screen.getByRole('button', { name: `Categoría ${restaurants}` })
      ).toBeInTheDocument()
    })
  })

  it('shows only the sections asked for', () => {
    render(
      <BulkEditDialog
        {...baseProps({ showCategorySection: true, showTagSection: false })}
      />
    )

    expect(
      screen.getByRole('button', { name: /^Categoría/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Etiquetas/ })).toBeNull()
  })
})
