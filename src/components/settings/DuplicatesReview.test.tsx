import { describe, expect, it, vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { Settings } from '../Settings'
import type { Transaction } from '../../models'
import type { SupabaseSession } from '../../services/supabase/client'
import type { DeleteResult } from '../../services/mutations/transaction-mutations'
import { UserFacingError } from '../../utils/user-error'

vi.mock('../../services/supabase/client', () => ({
  isSupabaseConfigured: () => false,
}))

const session = {
  user: { id: 'user-1', email: 'jose@example.uy' },
} as unknown as SupabaseSession

const aiProps = {
  claudeApiKey: '',
  onSetClaudeApiKey: () => {},
  aiEnabled: false,
  onSetAiEnabled: () => {},
  aiModel: 'claude-haiku-4-5',
  onSetAiModel: () => {},
}

// The same bank row, stored twice by overlapping exports before #57.
function copy(
  id: string,
  importId: string | undefined,
  createdAt: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2026-03-15T12:00:00Z'),
    description: 'COMPRA CON TARJETA DEBITO DISCO',
    amount: 1200,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: { fecha: '15/03/2026', referencia: '531814119796' },
    importId,
    createdAt: new Date(createdAt),
    ...overrides,
  }
}

const older = copy('older', 'run-a', '2026-03-20T12:00:00Z')
const newer = copy('newer', 'run-b', '2026-04-02T12:00:00Z')

function renderSettings(
  transactions: Transaction[],
  props: {
    preferredCurrency?: 'UYU' | 'USD'
    fxRate?: number
    onBulkDelete?: (ids: string[]) => Promise<DeleteResult>
  } = {}
) {
  const onBulkDelete =
    props.onBulkDelete ??
    vi.fn(async (ids: string[]) => ({
      removed: transactions.filter((tx) => ids.includes(tx.id)),
      reversible: true,
    }))
  const onRestoreTransactions = vi.fn(async (rows: Transaction[]) => ({
    restored: rows.length,
  }))
  render(
    <>
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency={props.preferredCurrency ?? 'UYU'}
        onSetCurrency={() => {}}
        fxRate={props.fxRate}
        session={session}
        supabaseEnabled={true}
        onSignOut={() => {}}
        transactions={transactions}
        onBulkDelete={onBulkDelete}
        onRestoreTransactions={onRestoreTransactions}
        {...aiProps}
      />
      <Toaster />
    </>
  )
  return { onBulkDelete, onRestoreTransactions }
}

function openReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Buscar duplicados' }))
  return screen.getByRole('dialog', { name: 'Posibles duplicados' })
}

describe('Configuración → Datos: Buscar posibles duplicados (#167)', () => {
  it('says so when there is nothing to clean up', () => {
    // Identical rows from one import run are a genuine pair, not duplicates.
    renderSettings([older, copy('genuine', 'run-a', '2026-03-20T12:00:00Z')])

    const dialog = openReview()

    expect(
      within(dialog).getByText('No encontramos posibles duplicados')
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: /^Eliminar/ })
    ).not.toBeInTheDocument()
  })

  it('pre-selects every copy but the oldest and shows how much they add to spending', () => {
    renderSettings([newer, older])

    const dialog = openReview()

    expect(
      within(dialog).getByText('Importadas más de una vez')
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Eliminar la copia de COMPRA CON TARJETA DEBITO DISCO importada el 02/04/2026',
      })
    ).toBeChecked()
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Eliminar la copia de COMPRA CON TARJETA DEBITO DISCO importada el 20/03/2026',
      })
    ).not.toBeChecked()
    expect(dialog).toHaveTextContent(
      'Estas copias suman $U 1.200,00 a tus gastos'
    )
    expect(
      within(dialog).getByRole('button', { name: 'Eliminar 1 copia' })
    ).toBeEnabled()
  })

  it('totals the selection in the home currency and follows the checkboxes', () => {
    renderSettings(
      [
        newer,
        older,
        copy('usd-a', 'run-a', '2026-03-20T12:00:00Z', {
          description: 'AMAZON',
          amount: 10,
          currency: 'USD',
        }),
        copy('usd-b', 'run-b', '2026-04-02T12:00:00Z', {
          description: 'AMAZON',
          amount: 10,
          currency: 'USD',
        }),
      ],
      { preferredCurrency: 'USD', fxRate: 40 }
    )

    const dialog = openReview()
    // $U 1.200 at 40 + US$ 10.
    expect(dialog).toHaveTextContent('Estas copias suman US$ 40,00')

    fireEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'Eliminar la copia de AMAZON importada el 02/04/2026',
      })
    )

    expect(dialog).toHaveTextContent('Estas copias suman US$ 30,00')
    expect(
      within(dialog).getByRole('button', { name: 'Eliminar 1 copia' })
    ).toBeInTheDocument()
  })

  it('does not count a copy that is not a counted expense', () => {
    renderSettings([
      copy('in-a', 'run-a', '2026-03-20T12:00:00Z', { type: 'credit' }),
      copy('in-b', 'run-b', '2026-04-02T12:00:00Z', { type: 'credit' }),
    ])

    const dialog = openReview()

    expect(
      within(dialog).getByRole('button', { name: 'Eliminar 1 copia' })
    ).toBeEnabled()
    expect(dialog).not.toHaveTextContent('a tus gastos')
  })

  it('lists rows of unknown origin apart, with nothing selected', () => {
    renderSettings([
      copy('legacy-1', undefined, '2025-10-01T12:00:00Z'),
      copy('legacy-2', undefined, '2025-10-01T12:00:00Z'),
    ])

    const dialog = openReview()

    expect(
      within(dialog).getByText('No sabemos de qué archivo vienen')
    ).toBeInTheDocument()
    const boxes = within(dialog).getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    boxes.forEach((box) => expect(box).not.toBeChecked())
    expect(
      within(dialog).getByRole('button', { name: 'Eliminar 0 copias' })
    ).toBeDisabled()
  })

  it('leaves split copies and copies without a reference to review by hand', () => {
    renderSettings([
      copy('split', 'run-a', '2026-03-20T12:00:00Z', { isSplitParent: true }),
      copy('copy', 'run-b', '2026-04-02T12:00:00Z'),
      copy('ref-a', 'run-a', '2026-03-20T12:00:00Z', { description: 'UTE' }),
      copy('no-ref', 'run-b', '2026-04-02T12:00:00Z', {
        description: 'UTE',
        rawData: { fecha: '15/03/2026' },
      }),
    ])

    const dialog = openReview()

    expect(within(dialog).getByText('Revisar a mano')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Una copia está dividida: esa no se puede eliminar desde acá.'
      )
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Una copia no tiene número de referencia para comparar.'
      )
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('checkbox', {
        name: 'Eliminar la copia de COMPRA CON TARJETA DEBITO DISCO importada el 20/03/2026',
      })
    ).toBeDisabled()
    within(dialog)
      .getAllByRole('checkbox')
      .forEach((box) => expect(box).not.toBeChecked())
    expect(
      within(dialog).getByRole('button', { name: 'Eliminar 0 copias' })
    ).toBeDisabled()
  })

  it('deletes exactly the selected copies and offers to undo', async () => {
    const { onBulkDelete, onRestoreTransactions } = renderSettings([
      newer,
      older,
    ])

    const dialog = openReview()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Eliminar 1 copia' })
    )

    await waitFor(() => expect(onBulkDelete).toHaveBeenCalledWith(['newer']))
    expect(await screen.findByText('1 transacción eliminada')).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Posibles duplicados' })
      ).not.toBeInTheDocument()
    )

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))

    expect(onRestoreTransactions).toHaveBeenCalledWith([newer])
    expect(await screen.findByText('1 transacción restaurada')).toBeTruthy()
  })

  it('keeps the review open and never shows raw error text', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSettings([newer, older], {
      onBulkDelete: vi.fn(async () => {
        throw new Error('fetch failed: 503')
      }),
    })

    const dialog = openReview()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Eliminar 1 copia' })
    )

    expect(
      await screen.findByText('No se pudieron eliminar los duplicados')
    ).toBeInTheDocument()
    expect(screen.queryByText(/fetch failed/)).not.toBeInTheDocument()
    expect(logged).toHaveBeenCalledWith(new Error('fetch failed: 503'))
    logged.mockRestore()
    expect(
      screen.getByRole('dialog', { name: 'Posibles duplicados' })
    ).toBeInTheDocument()
  })

  it('shows a user-facing error as written', async () => {
    renderSettings([newer, older], {
      onBulkDelete: vi.fn(async () => {
        throw new UserFacingError('Tu sesión terminó.')
      }),
    })

    fireEvent.click(
      within(openReview()).getByRole('button', { name: 'Eliminar 1 copia' })
    )

    expect(await screen.findByText('Tu sesión terminó.')).toBeInTheDocument()
  })

  it('is not offered when deleting is not wired', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[newer, older]}
        {...aiProps}
      />
    )

    expect(
      screen.queryByRole('button', { name: 'Buscar duplicados' })
    ).not.toBeInTheDocument()
  })
})
