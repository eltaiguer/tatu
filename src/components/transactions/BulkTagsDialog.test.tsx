import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { BulkTagsDialog } from './BulkTagsDialog'

type DialogProps = ComponentProps<typeof BulkTagsDialog>

function baseProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    open: true,
    selectionCount: 3,
    tagSuggestions: ['viaje', 'trabajo'],
    isBulkOperating: false,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

const openPicker = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Etiquetas/ }))

describe('BulkTagsDialog', () => {
  it('says how many transactions will be tagged', () => {
    render(<BulkTagsDialog {...baseProps({ selectionCount: 3 })} />)

    expect(
      screen.getByRole('dialog', { name: 'Etiquetas para 3 transacciones' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Se agregan a las seleccionadas; las que ya la tienen no cambian.'
      )
    ).toBeInTheDocument()
  })

  it('uses the singular for a single transaction', () => {
    render(<BulkTagsDialog {...baseProps({ selectionCount: 1 })} />)

    expect(
      screen.getByRole('dialog', { name: 'Etiquetas para 1 transacción' })
    ).toBeInTheDocument()
  })

  it('has no Categoría field', () => {
    render(<BulkTagsDialog {...baseProps()} />)

    expect(screen.queryByText('Categoría')).toBeNull()
  })

  it('saves picked and newly created tags', () => {
    const props = baseProps()
    render(<BulkTagsDialog {...props} />)

    openPicker()
    fireEvent.click(screen.getByRole('button', { name: '#viaje' }))
    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: '  trabajo ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '#trabajo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiquetas' }))

    expect(props.onSave).toHaveBeenCalledWith(['viaje', 'trabajo'])
  })

  it('creates a tag that does not exist yet', () => {
    const props = baseProps()
    render(<BulkTagsDialog {...props} />)

    openPicker()
    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: '  vacaciones ' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Crear etiqueta "vacaciones"' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiquetas' }))

    expect(props.onSave).toHaveBeenCalledWith(['vacaciones'])
  })

  it('toggles off a tag that was already picked', () => {
    const props = baseProps()
    render(<BulkTagsDialog {...props} />)

    openPicker()
    fireEvent.click(screen.getByRole('button', { name: '#viaje' }))
    fireEvent.click(screen.getByRole('button', { name: '#trabajo' }))
    fireEvent.click(screen.getByRole('button', { name: '#viaje ✓' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiquetas' }))

    expect(props.onSave).toHaveBeenCalledWith(['trabajo'])
  })

  it('removes a picked tag from its chip', () => {
    const props = baseProps()
    render(<BulkTagsDialog {...props} />)

    openPicker()
    fireEvent.click(screen.getByRole('button', { name: '#viaje' }))
    fireEvent.click(screen.getByRole('button', { name: '#trabajo' }))
    fireEvent.click(screen.getByLabelText('Quitar etiqueta viaje'))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar etiquetas' }))

    expect(props.onSave).toHaveBeenCalledWith(['trabajo'])
  })

  it('does not allow saving when no tag was picked', () => {
    render(<BulkTagsDialog {...baseProps()} />)

    expect(
      screen.getByRole('button', { name: 'Agregar etiquetas' })
    ).toBeDisabled()
  })

  it('blocks saving and cancelling while the bulk write runs', () => {
    render(<BulkTagsDialog {...baseProps({ isBulkOperating: true })} />)

    expect(
      screen.getByRole('button', { name: 'Agregar etiquetas' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('lists only the tags matching the search', () => {
    render(<BulkTagsDialog {...baseProps()} />)

    openPicker()
    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: 'VIA' },
    })

    expect(screen.getByRole('button', { name: '#viaje' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '#trabajo' })
    ).not.toBeInTheDocument()
  })

  it('names the picker by its label and how many tags are chosen', () => {
    render(<BulkTagsDialog {...baseProps()} />)

    expect(
      screen.getByRole('button', { name: 'Etiquetas Sin cambios' })
    ).toBeInTheDocument()
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: '#viaje' }))
    expect(
      screen.getByRole('button', { name: 'Etiquetas 1 etiqueta a agregar' })
    ).toBeInTheDocument()
  })

  it('starts over each time it opens', async () => {
    const props = baseProps()
    const { rerender } = render(<BulkTagsDialog {...props} />)
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: '#viaje' }))

    rerender(<BulkTagsDialog {...props} open={false} />)
    rerender(<BulkTagsDialog {...props} open />)

    expect(
      screen.getByRole('button', { name: 'Etiquetas Sin cambios' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar etiquetas' })
    ).toBeDisabled()
  })

  describe('keyboard', () => {
    it('adds a new tag typed in the search with Enter', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<BulkTagsDialog {...props} />)

      await user.click(screen.getByRole('button', { name: /^Etiquetas/ }))
      await user.type(
        screen.getByLabelText('Buscar o crear etiqueta'),
        'vacaciones{Enter}'
      )

      expect(
        screen.getByRole('button', { name: 'Quitar etiqueta vacaciones' })
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Buscar o crear etiqueta')).toHaveValue('')
      await user.click(
        screen.getByRole('button', { name: 'Agregar etiquetas' })
      )
      expect(props.onSave).toHaveBeenCalledWith(['vacaciones'])
    })

    it('adds the existing tag, not a near-duplicate, when the typed case differs', async () => {
      const user = userEvent.setup()
      const props = baseProps()
      render(<BulkTagsDialog {...props} />)

      await user.click(screen.getByRole('button', { name: /^Etiquetas/ }))
      await user.type(
        screen.getByLabelText('Buscar o crear etiqueta'),
        ' VIAJE {Enter}'
      )
      await user.click(
        screen.getByRole('button', { name: 'Agregar etiquetas' })
      )

      expect(props.onSave).toHaveBeenCalledWith(['viaje'])
    })

    it('adds an existing tag typed in the search with Enter, once', async () => {
      const user = userEvent.setup()
      render(<BulkTagsDialog {...baseProps()} />)

      await user.click(screen.getByRole('button', { name: /^Etiquetas/ }))
      const search = screen.getByLabelText('Buscar o crear etiqueta')
      await user.type(search, 'viaje{Enter}')
      await user.type(search, 'viaje{Enter}')

      expect(
        screen.getAllByRole('button', { name: 'Quitar etiqueta viaje' })
      ).toHaveLength(1)
    })
  })
})
