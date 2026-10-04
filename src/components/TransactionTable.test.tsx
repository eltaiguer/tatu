import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { TransactionTable } from './TransactionTable'
import { Category } from '../models'
import type { Transaction } from '../models'
import { replaceCustomCategories } from '../services/categories/category-store'

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2025-03-10T12:00:00'),
    description: 'SUPERMERCADO ABC',
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    category: Category.Groceries,
    categoryConfidence: 1,
    rawData: {},
    ...overrides,
  }
}

type TableProps = ComponentProps<typeof TransactionTable>

function renderTable(overrides: Partial<TableProps> = {}) {
  const props: TableProps = {
    paginatedTransactions: [
      makeTransaction({ id: 'tx-1', description: 'SUPERMERCADO ABC' }),
      makeTransaction({ id: 'tx-2', description: 'FARMACIA XYZ' }),
    ],
    selectedTransactionIds: [],
    allPageSelected: false,
    somePageSelected: false,
    isBusy: false,
    pendingTransactionIds: new Set<string>(),
    sortField: 'date',
    sortDirection: 'desc',
    hasActiveFilters: false,
    selectionCount: 0,
    totalCount: 2,
    showIgnored: false,
    ignoredCount: 0,
    onToggleSelect: vi.fn(),
    onHeaderCheckboxChange: vi.fn(),
    onSort: vi.fn(),
    onClearFilters: vi.fn(),
    onShowIgnoredChange: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onSplit: vi.fn(),
    onUnsplit: vi.fn(),
    ...overrides,
  }
  render(<TransactionTable {...props} />)
  // jsdom applies no Tailwind CSS, so the desktop table and the mobile card
  // list are both in the DOM. Assertions target the desktop table.
  return { props, table: within(screen.getByRole('table')) }
}

function rowFor(
  table: ReturnType<typeof within>,
  description: string
): HTMLElement {
  const row = table
    .getAllByRole('row')
    .find((r: HTMLElement) => within(r).queryByText(description))
  if (!row) throw new Error(`No row for ${description}`)
  return row
}

describe('TransactionTable', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  describe('selection', () => {
    it('selects a single row by its id', () => {
      const { props, table } = renderTable()

      fireEvent.click(table.getByLabelText('Seleccionar FARMACIA XYZ'))

      expect(props.onToggleSelect).toHaveBeenCalledTimes(1)
      expect(props.onToggleSelect).toHaveBeenCalledWith('tx-2', true)
    })

    it('shows a selected row as checked and deselects it on click', () => {
      const { props, table } = renderTable({
        selectedTransactionIds: ['tx-2'],
        selectionCount: 1,
        somePageSelected: true,
      })

      const selected = table.getByLabelText('Seleccionar FARMACIA XYZ')
      expect(selected).toHaveAttribute('aria-checked', 'true')
      expect(
        table.getByLabelText('Seleccionar SUPERMERCADO ABC')
      ).toHaveAttribute('aria-checked', 'false')

      fireEvent.click(selected)
      expect(props.onToggleSelect).toHaveBeenCalledWith('tx-2', false)
    })

    it('reports the selection count to the user', () => {
      renderTable({ selectionCount: 2, totalCount: 5 })

      expect(screen.getByRole('status')).toHaveTextContent(
        '2 de 5 seleccionadas'
      )
    })

    it('selects every row on the page from the header checkbox', () => {
      const { props, table } = renderTable()

      const header = table.getByLabelText('Seleccionar todas')
      expect(header).toHaveAttribute('aria-checked', 'false')

      fireEvent.click(header)
      expect(props.onHeaderCheckboxChange).toHaveBeenCalledWith(true)
    })

    it('shows a partial page selection as mixed', () => {
      const { table } = renderTable({ somePageSelected: true })

      expect(table.getByLabelText('Seleccionar todas')).toHaveAttribute(
        'aria-checked',
        'mixed'
      )
    })

    it('clears the page selection from the header checkbox when all are selected', () => {
      const { props, table } = renderTable({
        selectedTransactionIds: ['tx-1', 'tx-2'],
        allPageSelected: true,
      })

      fireEvent.click(table.getByLabelText('Seleccionar todas'))
      expect(props.onHeaderCheckboxChange).toHaveBeenCalledWith(false)
    })

    it('blocks selection while a bulk operation is running', () => {
      const { table } = renderTable({ isBusy: true })

      expect(table.getByLabelText('Seleccionar todas')).toBeDisabled()
      expect(table.getByLabelText('Seleccionar FARMACIA XYZ')).toBeDisabled()
    })
  })

  describe('row actions', () => {
    it('edits the transaction of the row whose button was clicked', () => {
      const { props, table } = renderTable()

      fireEvent.click(table.getByLabelText('Editar FARMACIA XYZ'))

      expect(props.onEdit).toHaveBeenCalledTimes(1)
      expect(props.onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-2' })
      )
    })

    it('deletes the transaction of the row whose button was clicked', () => {
      const { props, table } = renderTable()

      fireEvent.click(table.getByLabelText('Eliminar SUPERMERCADO ABC'))

      expect(props.onDelete).toHaveBeenCalledTimes(1)
      expect(props.onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-1' })
      )
    })

    it('splits the transaction of the row whose button was clicked', () => {
      const { props, table } = renderTable()

      fireEvent.click(table.getByLabelText('Dividir FARMACIA XYZ'))

      expect(props.onSplit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-2' })
      )
    })

    it('disables the actions of a row with a pending save', () => {
      const { table } = renderTable({
        pendingTransactionIds: new Set(['tx-2']),
      })

      expect(table.getByLabelText('Editar FARMACIA XYZ')).toBeDisabled()
      expect(table.getByLabelText('Eliminar FARMACIA XYZ')).toBeDisabled()
      expect(table.getByLabelText('Editar SUPERMERCADO ABC')).toBeEnabled()
    })

    it('labels actions with the friendly description when one is set', () => {
      const { props, table } = renderTable({
        paginatedTransactions: [
          makeTransaction({
            id: 'tx-9',
            description: 'POS COMPRA 123 DISCO',
            displayDescription: 'Disco',
          }),
        ],
      })

      fireEvent.click(table.getByLabelText('Editar Disco'))
      expect(props.onEdit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tx-9' })
      )
      // The bank's original description stays visible underneath.
      expect(table.getByText('POS COMPRA 123 DISCO')).toBeInTheDocument()
    })
  })

  describe('split transactions', () => {
    const parent = makeTransaction({
      id: 'parent',
      description: 'COMPRA GRANDE',
      amount: 300,
      isSplitParent: true,
    })
    const childA = makeTransaction({
      id: 'child-a',
      description: 'Parte comida',
      amount: 200,
      splitParentId: 'parent',
    })
    const childB = makeTransaction({
      id: 'child-b',
      description: 'Parte limpieza',
      amount: 100,
      splitParentId: 'parent',
      category: Category.Shopping,
    })

    it('renders the split parts directly under their parent', () => {
      const { table } = renderTable({
        paginatedTransactions: [parent, childA, childB],
        totalCount: 3,
      })

      const bodyRows = table.getAllByRole('row').slice(1)
      expect(bodyRows[0]).toHaveTextContent('COMPRA GRANDE')
      expect(bodyRows[1]).toHaveTextContent('Parte comida')
      expect(bodyRows[2]).toHaveTextContent('Parte limpieza')
    })

    it('marks the parent as split and offers to restore it', () => {
      const { props, table } = renderTable({
        paginatedTransactions: [parent, childA, childB],
      })

      const parentRow = within(rowFor(table, 'COMPRA GRANDE'))
      expect(parentRow.getByText('Dividida')).toBeInTheDocument()
      expect(parentRow.queryByLabelText('Dividir COMPRA GRANDE')).toBeNull()

      fireEvent.click(parentRow.getByLabelText('Restaurar COMPRA GRANDE'))
      expect(props.onUnsplit).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'parent' })
      )
    })

    it('indents split parts and does not let them be split or restored', () => {
      const { table } = renderTable({
        paginatedTransactions: [parent, childA],
      })

      const childRow = rowFor(table, 'Parte comida')
      expect(within(childRow).queryByText('Dividida')).toBeNull()
      expect(within(childRow).queryByLabelText(/^Dividir /)).toBeNull()
      expect(within(childRow).queryByLabelText(/^Restaurar /)).toBeNull()
      // The description cell is indented with a guide line on the left.
      const descriptionCell = within(childRow)
        .getByText('Parte comida')
        .closest('td')
      expect(descriptionCell).toHaveStyle({ paddingLeft: '20px' })
    })
  })

  describe('ignored transactions', () => {
    const transfer = makeTransaction({
      id: 'tx-transfer',
      description: 'TRANSFERENCIA PROPIA',
      category: Category.InternalTransfer,
    })

    it('flags an ignored row and strikes its amount through', () => {
      const { table } = renderTable({
        paginatedTransactions: [
          makeTransaction({ id: 'tx-1', description: 'SUPERMERCADO ABC' }),
          transfer,
        ],
      })

      const ignoredRow = within(rowFor(table, 'TRANSFERENCIA PROPIA'))
      expect(ignoredRow.getByText('Ignorada')).toBeInTheDocument()
      expect(ignoredRow.getByText(/-US\$/)).toHaveClass('line-through')

      const normalRow = within(rowFor(table, 'SUPERMERCADO ABC'))
      expect(normalRow.queryByText('Ignorada')).toBeNull()
      expect(normalRow.getByText(/-US\$/)).not.toHaveClass('line-through')
    })

    it('toggles showing ignored transfers and shows how many there are', () => {
      const { props } = renderTable({ ignoredCount: 3 })

      const toggle = screen.getByRole('button', {
        name: /Mostrar transferencias ignoradas/,
      })
      expect(toggle).toHaveTextContent('· 3')

      fireEvent.click(toggle)
      expect(props.onShowIgnoredChange).toHaveBeenCalledWith(true)
    })

    it('offers to hide ignored transfers when they are shown', () => {
      const { props } = renderTable({ ignoredCount: 3, showIgnored: true })

      fireEvent.click(
        screen.getByRole('button', { name: /Ocultar transferencias ignoradas/ })
      )
      expect(props.onShowIgnoredChange).toHaveBeenCalledWith(false)
    })

    it('disables the toggle when nothing is ignored', () => {
      renderTable({ ignoredCount: 0 })

      expect(
        screen.getByRole('button', { name: /transferencias ignoradas/ })
      ).toBeDisabled()
    })
  })

  describe('sorting and empty results', () => {
    it('sorts by the column whose header was clicked', () => {
      const { props, table } = renderTable()

      fireEvent.click(table.getByRole('button', { name: 'Monto' }))
      expect(props.onSort).toHaveBeenCalledWith('amount')
    })

    it('announces the current sort on its column header', () => {
      const { table } = renderTable({
        sortField: 'amount',
        sortDirection: 'asc',
      })

      expect(
        table.getByRole('columnheader', { name: 'Monto' })
      ).toHaveAttribute('aria-sort', 'ascending')
      expect(
        table.getByRole('columnheader', { name: 'Fecha' })
      ).toHaveAttribute('aria-sort', 'none')
    })

    it('offers to clear filters when they match nothing', () => {
      const { props, table } = renderTable({
        paginatedTransactions: [],
        hasActiveFilters: true,
        totalCount: 0,
      })

      expect(table.getByText('Sin resultados')).toBeInTheDocument()
      fireEvent.click(table.getByRole('button', { name: 'Limpiar filtros' }))
      expect(props.onClearFilters).toHaveBeenCalledTimes(1)
    })
  })
})
