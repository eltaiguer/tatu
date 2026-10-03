import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { Transactions } from './Transactions'
import type { Transaction } from '../models'
import { NeedsConfirmationError } from '../utils/user-error'

function makeTransaction(index: number, description?: string): Transaction {
  return {
    id: `tx-${index}`,
    date: new Date(2026, 0, index + 1),
    description: description ?? `transaction ${index}`,
    amount: 100 + index,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

describe('Transactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the newest month "Este mes" in UTC-3 when its first row is dated the 1st', () => {
    // Tx dates are calendar days stored at UTC midnight; read in local time
    // in Uruguay, Oct 1 00:00Z is still Sep 30 and the label would disagree
    // with Resumen.
    const originalTz = process.env.TZ
    process.env.TZ = 'America/Montevideo'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T15:00:00.000Z'))
    try {
      render(
        <Transactions
          transactions={[
            {
              ...makeTransaction(0),
              date: new Date('2026-10-01T00:00:00.000Z'),
            },
          ]}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: /2026/ }))

      expect(screen.getByRole('button', { name: 'Este mes' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Último mes' })).toBeNull()
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTz
    }
  })

  it('clamps pagination when filtering reduces total pages', () => {
    const transactions = Array.from({ length: 25 }, (_, i) =>
      makeTransaction(i, i === 3 ? 'target merchant' : `transaction ${i}`)
    )

    render(<Transactions transactions={transactions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.change(
      screen.getByPlaceholderText('Buscar por comercio o descripción...'),
      {
        target: { value: 'target merchant' },
      }
    )

    expect(screen.getAllByText('target merchant').length).toBeGreaterThan(0)
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeInTheDocument()
  })

  it('shows pagination zero count when there are no transactions', () => {
    render(<Transactions transactions={[]} />)

    // No-data empty state is handled at App level (Onboarding); the component itself
    // renders fine with an empty table and correct pagination text.
    expect(screen.getByText('Mostrando 0 de 0')).toBeInTheDocument()
  })

  it('allows searching by tags', () => {
    const transactions = [
      makeTransaction(1, 'supermarket'),
      {
        ...makeTransaction(2, 'invoice'),
        tags: ['services', 'monthly'],
      },
    ]

    render(<Transactions transactions={transactions} />)

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por comercio o descripción...'),
      {
        target: { value: 'monthly' },
      }
    )

    expect(screen.getAllByText('invoice').length).toBeGreaterThan(0)
    expect(screen.queryByText('supermarket')).not.toBeInTheDocument()
  })

  it('filters transactions by description, date range, category and account', () => {
    const transactions: Transaction[] = [
      {
        ...makeTransaction(1, 'Alpha Market'),
        date: new Date(2026, 0, 10),
        category: 'groceries',
        source: 'bank_account',
      },
      {
        ...makeTransaction(2, 'Alpha Card'),
        date: new Date(2026, 0, 15),
        category: 'groceries',
        source: 'credit_card',
      },
      {
        ...makeTransaction(3, 'Utilities Payment'),
        date: new Date(2026, 0, 20),
        category: 'utilities',
        source: 'bank_account',
      },
    ]

    render(<Transactions transactions={transactions} />)

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por comercio o descripción...'),
      { target: { value: 'alpha' } }
    )
    fireEvent.change(screen.getByLabelText('Filtro fecha desde'), {
      target: { value: '2026-01-12' },
    })
    fireEvent.change(screen.getByLabelText('Filtro fecha hasta'), {
      target: { value: '2026-01-18' },
    })
    fireEvent.change(screen.getByLabelText('Filtro categoría'), {
      target: { value: 'groceries' },
    })
    fireEvent.change(screen.getByLabelText('Filtro cuenta'), {
      target: { value: 'credit_card' },
    })

    expect(screen.getAllByText('Alpha Card').length).toBeGreaterThan(0)
    expect(screen.queryByText('Alpha Market')).not.toBeInTheDocument()
    expect(screen.queryByText('Utilities Payment')).not.toBeInTheDocument()
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeInTheDocument()
  })

  it('shows translated category labels in filter dropdown', () => {
    render(
      <Transactions
        transactions={[
          {
            ...makeTransaction(1, 'Alpha Market'),
            category: 'groceries',
          },
          {
            ...makeTransaction(2, 'Resto del Mundo'),
            category: 'restaurants',
          },
        ]}
      />
    )

    // Open the category filter popover
    fireEvent.click(screen.getByLabelText('Filtro categoría'))

    expect(screen.getAllByText('Alimentación').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Restaurantes').length).toBeGreaterThan(0)
    expect(screen.queryByText('groceries')).not.toBeInTheDocument()
    expect(screen.queryByText('restaurants')).not.toBeInTheDocument()
  })

  it('shows filter-specific empty state when structured filters remove all matches', async () => {
    render(
      <Transactions
        transactions={[
          {
            ...makeTransaction(1, 'Alpha Market'),
            category: 'groceries',
            source: 'bank_account',
          },
        ]}
      />
    )

    fireEvent.click(screen.getByLabelText('Filtro cuenta'))
    await waitFor(() => screen.getByText('Tarjeta'))
    fireEvent.click(screen.getByText('Tarjeta'))

    await waitFor(() =>
      expect(screen.getAllByText('Sin resultados').length).toBeGreaterThan(0)
    )
    expect(screen.getByText('Mostrando 0 de 0')).toBeInTheDocument()
  })

  it('shows display description when present', () => {
    render(
      <Transactions
        transactions={[
          {
            ...makeTransaction(1, 'AUT 998877 DEVOTO'),
            displayDescription: 'Devoto',
          },
        ]}
      />
    )

    expect(screen.getAllByText('Devoto').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Original: AUT 998877 DEVOTO').length
    ).toBeGreaterThan(0)
  })

  it('opens modal editor when clicking edit', () => {
    render(<Transactions transactions={[makeTransaction(1, 'merchant')]} />)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant' })[0]
    )

    expect(screen.getByText('Editar transacción')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción edición')).toBeInTheDocument()
  })

  it('allows selecting transactions and triggering auto-categorization', async () => {
    const onAutoCategorizeTransactions = vi
      .fn()
      .mockResolvedValue({ categorized: 1 })

    render(
      <Transactions
        transactions={[
          makeTransaction(1, 'Devoto Supermercado'),
          makeTransaction(2, 'Netflix'),
        ]}
        onAutoCategorizeTransactions={onAutoCategorizeTransactions}
      />
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', {
        name: 'Seleccionar Devoto Supermercado',
      })[0]
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /Auto-categorizar/,
      })
    )

    await waitFor(() =>
      expect(onAutoCategorizeTransactions).toHaveBeenCalledWith(['tx-1'])
    )
  })

  it('shows selected count and pending state while auto-categorizing', async () => {
    let resolveAutoCategorize: (() => void) | undefined
    const onAutoCategorizeTransactions = vi.fn(
      () =>
        new Promise<{ categorized: number }>((resolve) => {
          resolveAutoCategorize = () => resolve({ categorized: 1 })
        })
    )

    render(
      <Transactions
        transactions={[makeTransaction(1, 'Devoto Supermercado')]}
        onAutoCategorizeTransactions={onAutoCategorizeTransactions}
      />
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', {
        name: 'Seleccionar Devoto Supermercado',
      })[0]
    )

    expect(screen.getAllByText('1 seleccionada').length).toBeGreaterThan(0)

    fireEvent.click(
      screen.getByRole('button', {
        name: /Auto-categorizar/,
      })
    )

    expect(
      screen.getByRole('button', { name: /Auto-categorizando/ })
    ).toBeDisabled()

    resolveAutoCategorize?.()

    await waitFor(() =>
      expect(screen.queryByText(/seleccionada/)).not.toBeInTheDocument()
    )
  })

  it('selects all page transactions via header checkbox', () => {
    const transactions = Array.from({ length: 25 }, (_, index) =>
      makeTransaction(index, `merchant ${index}`)
    )

    render(<Transactions transactions={transactions} />)

    const headerCheckboxes = screen.getAllByRole('checkbox', {
      name: 'Seleccionar todas',
    })
    fireEvent.click(headerCheckboxes[0])

    expect(screen.getAllByText('12 seleccionadas').length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('checkbox', { name: 'Seleccionar merchant 24' })[0]
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('deselects all via header checkbox when all are selected', () => {
    const transactions = [
      makeTransaction(1, 'Merchant A'),
      makeTransaction(2, 'Merchant B'),
    ]

    render(<Transactions transactions={transactions} />)

    const headerCheckboxes = screen.getAllByRole('checkbox', {
      name: 'Seleccionar todas',
    })
    fireEvent.click(headerCheckboxes[0])
    expect(screen.getAllByText('2 seleccionadas').length).toBeGreaterThan(0)

    fireEvent.click(headerCheckboxes[0])
    expect(screen.queryByText(/seleccionada/)).not.toBeInTheDocument()
  })

  it('unchecking page header only deselects current page — other pages remain selected', () => {
    // 25 transactions split across 2 pages (12 on page 1, 13 on page 2)
    const transactions = Array.from({ length: 25 }, (_, index) =>
      makeTransaction(index, `merchant ${index}`)
    )

    render(<Transactions transactions={transactions} />)

    // Select all 25 via header + "select all" link
    const headerCheckboxes = screen.getAllByRole('checkbox', {
      name: 'Seleccionar todas',
    })
    fireEvent.click(headerCheckboxes[0])
    fireEvent.click(screen.getByText('Seleccionar las 25 transacciones'))
    expect(screen.getAllByText('25 seleccionadas').length).toBeGreaterThan(0)

    // Navigate to page 2, then navigate back to page 1 — all page-1 items remain checked
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))

    // Uncheck header on page 1 — should only deselect the 12 page-1 items
    const page1HeaderCheckboxes = screen.getAllByRole('checkbox', {
      name: 'Seleccionar todas',
    })
    fireEvent.click(page1HeaderCheckboxes[0])

    // 13 page-2 selections remain (not 0, which the old bug would have caused)
    expect(screen.getAllByText('13 seleccionadas').length).toBeGreaterThan(0)
  })

  it('shows select-all link after selecting full page on multi-page results', () => {
    const transactions = Array.from({ length: 25 }, (_, index) =>
      makeTransaction(index, `merchant ${index}`)
    )

    render(<Transactions transactions={transactions} />)

    const headerCheckboxes = screen.getAllByRole('checkbox', {
      name: 'Seleccionar todas',
    })
    fireEvent.click(headerCheckboxes[0])

    expect(screen.getAllByText('12 seleccionadas').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Seleccionar las 25 transacciones'))

    expect(screen.getAllByText('25 seleccionadas').length).toBeGreaterThan(0)
  })

  it('triggers transaction update from modal edit', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue({ affected: 1 })

    const transactions = [
      {
        ...makeTransaction(1, 'original merchant'),
        tags: ['old'],
      },
      {
        ...makeTransaction(2, 'other merchant'),
        tags: ['monthly'],
      },
    ]

    render(
      <Transactions
        transactions={transactions}
        onUpdateTransaction={onUpdateTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar original merchant' })[0]
    )

    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Edited merchant' },
    })
    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva categoría'), {
      target: { value: 'services' },
    })
    fireEvent.click(screen.getByLabelText('Crear categoría'))
    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.click(screen.getAllByText('monthly')[0])
    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    fireEvent.change(screen.getByLabelText('Nueva etiqueta'), {
      target: { value: 'recurring' },
    })
    fireEvent.click(screen.getByLabelText('Crear etiqueta'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(onUpdateTransaction).toHaveBeenCalledWith('tx-1', {
        displayDescription: 'Edited merchant',
        category: 'services',
        tags: ['old', 'monthly', 'recurring'],
        applyScope: 'single',
      })
    )
  })

  it('keeps the editor open and shows an error when saving fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onUpdateTransaction = vi.fn().mockRejectedValue(new Error('boom'))

    render(
      <>
        <Transactions
          transactions={[makeTransaction(1, 'merchant')]}
          onUpdateTransaction={onUpdateTransaction}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant' })[0]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('No se pudieron guardar los cambios')
    ).toBeTruthy()
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Descripción edición')).toBeInTheDocument()
  })

  it('reports how many transactions an apply-to-similar edit changed', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue({ affected: 13 })

    render(
      <>
        <Transactions
          transactions={[makeTransaction(1, 'merchant')]}
          onUpdateTransaction={onUpdateTransaction}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant' })[0]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Cambios aplicados a 13 transacciones')
    ).toBeTruthy()
  })

  it('tells how many transactions an apply-to-similar edit will touch', () => {
    render(
      <Transactions
        transactions={[
          // Newest first in the table, so the first "Editar" is tx-4.
          makeTransaction(0, 'Devoto'),
          // A split part shares the merchant name but is never "similar".
          { ...makeTransaction(1, 'CANTINA 25'), splitParentId: 'tx-9' },
          makeTransaction(2, 'CANTINA 25'),
          makeTransaction(3, 'Cantina 25'),
          makeTransaction(4, 'CANTINA 25'),
        ]}
        onUpdateTransaction={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByRole('button', { name: /^Editar/ })[0])

    expect(
      screen.getByLabelText(/se aplica a 3 transacciones/)
    ).toBeInTheDocument()
  })

  it('shows which transaction is being edited and explains the future-only scope', () => {
    render(
      <Transactions
        transactions={[
          makeTransaction(0, 'CANTINA 25'),
          makeTransaction(1, 'CANTINA 25'),
        ]}
        onUpdateTransaction={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByRole('button', { name: /^Editar/ })[0])

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/-\$U 10[01],00 · Cuenta \$U/)).toBeTruthy()

    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    expect(
      screen.getByText(/El nombre visible se comparte con todas las similares/)
    ).toBeInTheDocument()
  })

  it('sends matching scope when selected in editor', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue({ affected: 1 })

    render(
      <Transactions
        transactions={[makeTransaction(1, 'AUT 998877 DEVOTO')]}
        onUpdateTransaction={onUpdateTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar AUT 998877 DEVOTO' })[0]
    )
    fireEvent.click(screen.getByLabelText(/^Todas las similares/))
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(onUpdateTransaction).toHaveBeenCalledWith('tx-1', {
        displayDescription: 'Devoto',
        category: undefined,
        tags: [],
        applyScope: 'matching_past_and_future',
      })
    )
  })

  it('sends future scope when selected in editor', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue({ affected: 1 })

    render(
      <Transactions
        transactions={[makeTransaction(1, 'AUT 998877 DEVOTO')]}
        onUpdateTransaction={onUpdateTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar AUT 998877 DEVOTO' })[0]
    )
    fireEvent.click(
      screen.getByLabelText('Esta y las que importes en el futuro')
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: 'Devoto' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(onUpdateTransaction).toHaveBeenCalledWith('tx-1', {
        displayDescription: 'Devoto',
        category: undefined,
        tags: [],
        applyScope: 'future_matching_only',
      })
    )
  })

  it('validates empty description before saving edit', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue({ affected: 1 })

    render(
      <Transactions
        transactions={[makeTransaction(1, 'merchant')]}
        onUpdateTransaction={onUpdateTransaction}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant' })[0]
    )
    fireEvent.change(screen.getByLabelText('Descripción edición'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      screen.getByText('La descripción no puede quedar vacía')
    ).toBeInTheDocument()
    expect(onUpdateTransaction).not.toHaveBeenCalled()
  })

  it('shows category and tag suggestions in modal editor', () => {
    const transactions = [
      {
        ...makeTransaction(1, 'merchant one'),
        category: 'utilities',
        tags: ['monthly'],
      },
      {
        ...makeTransaction(2, 'merchant two'),
        category: 'custom-category',
        tags: ['fixed-cost'],
      },
    ]

    render(<Transactions transactions={transactions} />)

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Editar merchant one' })[0]
    )

    fireEvent.click(screen.getByLabelText('Categoría dropdown'))
    expect(screen.getAllByText('Servicios').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('Etiquetas dropdown'))
    expect(screen.getAllByText('monthly').length).toBeGreaterThan(0)
    expect(screen.getByText('fixed-cost')).toBeInTheDocument()
  })

  it('deletes without asking and offers an undo that restores the row', async () => {
    const tx = makeTransaction(1, 'to-delete')
    const onDeleteTransaction = vi
      .fn()
      .mockResolvedValue({ removed: [tx], reversible: true })
    const onRestoreTransactions = vi.fn().mockResolvedValue({ restored: 1 })

    render(
      <>
        <Transactions
          transactions={[tx]}
          onDeleteTransaction={onDeleteTransaction}
          onRestoreTransactions={onRestoreTransactions}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar to-delete' })[0]
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(onDeleteTransaction).toHaveBeenCalledWith('tx-1', {
        allowIrreversible: false,
      })
    )
    expect(await screen.findByText('1 transacción eliminada')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))

    expect(onRestoreTransactions).toHaveBeenCalledWith([tx])
    expect(await screen.findByText('1 transacción restaurada')).toBeTruthy()
  })

  it('asks for confirmation only when the delete cannot be undone', async () => {
    const tx = { ...makeTransaction(1, 'split-parent'), isSplitParent: true }
    const onDeleteTransaction = vi
      .fn()
      .mockRejectedValueOnce(new NeedsConfirmationError())
      .mockResolvedValueOnce({ removed: [tx], reversible: false })

    render(
      <>
        <Transactions
          transactions={[tx]}
          onDeleteTransaction={onDeleteTransaction}
          onRestoreTransactions={vi.fn()}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar split-parent' })[0]
    )
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar',
      })
    )

    await waitFor(() =>
      expect(onDeleteTransaction).toHaveBeenLastCalledWith('tx-1', {
        allowIrreversible: true,
      })
    )
    expect(await screen.findByText('1 transacción eliminada')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Deshacer' })
    ).not.toBeInTheDocument()
  })

  it('does not delete when an irreversible delete is not confirmed', async () => {
    const onDeleteTransaction = vi
      .fn()
      .mockRejectedValue(new NeedsConfirmationError())

    render(
      <Transactions
        transactions={[makeTransaction(1, 'to-keep')]}
        onDeleteTransaction={onDeleteTransaction}
        onRestoreTransactions={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar to-keep' })[0]
    )

    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancelar',
      })
    )

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(onDeleteTransaction).toHaveBeenCalledTimes(1)
  })

  it('shows an error, not a success, when a delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onDeleteTransaction = vi.fn().mockRejectedValue(new Error('boom'))

    render(
      <>
        <Transactions
          transactions={[makeTransaction(1, 'to-keep')]}
          onDeleteTransaction={onDeleteTransaction}
          onRestoreTransactions={vi.fn()}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Eliminar to-keep' })[0]
    )

    expect(
      await screen.findByText('No se pudo eliminar la transacción')
    ).toBeTruthy()
    expect(screen.queryByText(/eliminada/)).not.toBeInTheDocument()
  })

  it('bulk categorizes selected transactions', async () => {
    const onBulkCategorize = vi.fn().mockResolvedValue({ updated: 2 })

    render(
      <Transactions
        transactions={[
          makeTransaction(1, 'Devoto'),
          makeTransaction(2, 'Netflix'),
        ]}
        onBulkCategorize={onBulkCategorize}
      />
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Devoto' })[0]
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Netflix' })[0]
    )

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    })

    fireEvent.click(screen.getByLabelText('Categoría bulk dropdown'))

    fireEvent.change(screen.getByLabelText('Buscar categoría'), {
      target: { value: 'entretenimiento' },
    })

    const popoverButtons = screen.getAllByText('Entretenimiento')
    fireEvent.click(popoverButtons[popoverButtons.length - 1])

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))

    await waitFor(() =>
      expect(onBulkCategorize).toHaveBeenCalledWith(
        ['tx-1', 'tx-2'],
        'entertainment'
      )
    )
  })

  it('bulk deletes without asking and offers undo for all of them', async () => {
    const a = makeTransaction(1, 'Merchant A')
    const b = makeTransaction(2, 'Merchant B')
    const onBulkDelete = vi
      .fn()
      .mockResolvedValue({ removed: [a, b], reversible: true })
    const onRestoreTransactions = vi.fn().mockResolvedValue({ restored: 2 })

    render(
      <>
        <Transactions
          transactions={[a, b]}
          onBulkDelete={onBulkDelete}
          onRestoreTransactions={onRestoreTransactions}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Merchant A' })[0]
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Merchant B' })[0]
    )
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/ }))

    await waitFor(() =>
      expect(onBulkDelete).toHaveBeenCalledWith(['tx-1', 'tx-2'], {
        allowIrreversible: false,
      })
    )
    expect(await screen.findByText('2 transacciones eliminadas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(onRestoreTransactions).toHaveBeenCalledWith([a, b])
  })

  it('does not bulk delete when an irreversible delete is not confirmed', async () => {
    const onBulkDelete = vi.fn().mockRejectedValue(new NeedsConfirmationError())

    render(
      <Transactions
        transactions={[makeTransaction(1, 'Merchant A')]}
        onBulkDelete={onBulkDelete}
        onRestoreTransactions={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Merchant A' })[0]
    )
    fireEvent.click(screen.getByRole('button', { name: /^Eliminar$/ }))

    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancelar',
      })
    )

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(onBulkDelete).toHaveBeenCalledTimes(1)
  })

  it('says what applied when a bulk edit fails part-way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onBulkCategorize = vi.fn().mockResolvedValue({ updated: 1 })
    const onBulkTag = vi.fn().mockRejectedValue(new Error('boom'))

    render(
      <>
        <Transactions
          transactions={[makeTransaction(1, 'Devoto')]}
          onBulkCategorize={onBulkCategorize}
          onBulkTag={onBulkTag}
        />
        <Toaster />
      </>
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Devoto' })[0]
    )
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    })
    fireEvent.click(screen.getByLabelText('Categoría bulk dropdown'))
    fireEvent.change(screen.getByLabelText('Buscar categoría'), {
      target: { value: 'entretenimiento' },
    })
    const options = screen.getAllByText('Entretenimiento')
    fireEvent.click(options[options.length - 1])
    fireEvent.click(screen.getByLabelText('Etiquetas bulk dropdown'))
    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: 'viaje' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /Crear etiqueta "viaje"/ })
    )
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))

    expect(
      await screen.findByText(
        /Se aplicó la categoría, pero falló el resto: No se pudieron actualizar/
      )
    ).toBeTruthy()
    expect(screen.queryByText(/actualizada/)).not.toBeInTheDocument()
  })

  it('bulk tags selected transactions', async () => {
    const onBulkTag = vi.fn().mockResolvedValue({ updated: 2 })

    render(
      <Transactions
        transactions={[
          { ...makeTransaction(1, 'Devoto'), tags: ['monthly'] },
          makeTransaction(2, 'Netflix'),
        ]}
        onBulkTag={onBulkTag}
      />
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Devoto' })[0]
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Netflix' })[0]
    )

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])
    })

    fireEvent.click(screen.getByLabelText('Etiquetas bulk dropdown'))

    const tagButtons = screen.getAllByText('#monthly')
    fireEvent.click(tagButtons[tagButtons.length - 1])

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))

    await waitFor(() =>
      expect(onBulkTag).toHaveBeenCalledWith(['tx-1', 'tx-2'], 'monthly')
    )
  })

  it('bulk tags with a new tag via create button', async () => {
    const onBulkTag = vi.fn().mockResolvedValue({ updated: 2 })

    render(
      <Transactions
        transactions={[makeTransaction(1, 'Devoto')]}
        onBulkTag={onBulkTag}
      />
    )

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Devoto' })[0]
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Editar/ })[0])

    fireEvent.click(screen.getByLabelText('Etiquetas bulk dropdown'))

    fireEvent.change(screen.getByLabelText('Buscar o crear etiqueta'), {
      target: { value: 'new-tag' },
    })

    fireEvent.click(
      screen.getByRole('button', { name: /Crear etiqueta "new-tag"/ })
    )

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))

    await waitFor(() =>
      expect(onBulkTag).toHaveBeenCalledWith(['tx-1'], 'new-tag')
    )
  })
})
