import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { HouseholdRulesSection } from './HouseholdRulesSection'
import { HouseToggle } from '../transactions/HouseToggle'
import type { Transaction } from '../../models'
import { Category } from '../../models'
import { createInMemoryRepository } from '../../services/repository/in-memory-repository'
import {
  clearHouseholdRules,
  listHouseholdRuleRecords,
  loadHouseholdRules,
  putMerchantHouseholdRule,
} from '../../services/household/household-rules-store'
import { merchantOverrideKey } from '../../services/categorizer/category-overrides'
import { workspaceStore } from '../../stores/workspace-state'
import type { HouseholdRuleRecord } from '../../services/supabase/household-rules'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'DEVOTO 12/03/2026',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: Category.Restaurants,
    rawData: {},
    ...overrides,
  }
}

const DEVOTO_KEY = merchantOverrideKey('DEVOTO 12/03/2026') as string
const DISCO_KEY = merchantOverrideKey('DISCO 03/03/2026') as string

function rule(
  key: string,
  createdAt: string,
  extra: Partial<HouseholdRuleRecord> = {}
): HouseholdRuleRecord {
  return {
    merchantNormalized: key,
    merchantOriginal: 'COMPRA DEVOTO 4521',
    isHousehold: true,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  }
}

let repo = createInMemoryRepository()

function seed(records: HouseholdRuleRecord[]) {
  repo = createInMemoryRepository({ householdRules: records })
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  loadHouseholdRules(records)
}

function renderSection(transactions: Transaction[] = []) {
  return render(
    <>
      <HouseholdRulesSection transactions={transactions} repository={repo} />
      <Toaster />
    </>
  )
}

describe('HouseholdRulesSection', () => {
  beforeEach(() => {
    clearHouseholdRules()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    // Unmount first: clearing the store re-renders anything still mounted.
    cleanup()
    clearHouseholdRules()
    workspaceStore.setState({ userId: null, status: 'idle' })
  })

  it('lists a saved rule with its merchant name, value and how many rows it reaches', () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    renderSection([
      makeTx({ id: 'a' }),
      makeTx({ id: 'b', description: 'DEVOTO 19/03/2026' }),
    ])

    expect(
      screen.getByRole('heading', { level: 2, name: 'Reglas del hogar' })
    ).toBeInTheDocument()
    const region = screen.getByRole('region', { name: 'Reglas del hogar' })
    expect(within(region).getByText('COMPRA DEVOTO 4521')).toBeInTheDocument()
    expect(within(region).getByText('Hogar: Sí')).toBeInTheDocument()
    expect(within(region).getByText('2 transacciones')).toBeInTheDocument()
  })

  it('shows a bank rule by its clean group label, the statement text as its title (#274)', () => {
    const raw =
      'COMPRA CON TARJETA DEBITO TINTORERIA MARTINIZI, MONTEVIDEO TARJ: ############9172'
    seed([
      rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z', { merchantOriginal: raw }),
    ])
    renderSection()

    const name = screen.getByText('Tintoreria Martinizi · Tarjeta de débito')
    expect(name).toHaveAttribute('title', raw)
    expect(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar Tintoreria Martinizi · Tarjeta de débito',
      })
    ).toBeInTheDocument()
  })

  it('tells two rules apart when their clean labels collide (#274)', () => {
    const card = (city: string) =>
      `COMPRA CON TARJETA DEBITO PANADERIA MARACANA, ${city} TARJ: ############9172`
    seed([
      rule('maracana-montevideo', '2026-03-02T10:00:00.000Z', {
        merchantOriginal: card('MONTEVIDEO'),
      }),
      rule('maracana-carrasco', '2026-03-01T10:00:00.000Z', {
        merchantOriginal: card('CARRASCO'),
      }),
    ])
    renderSection()
    const buttons = screen.getAllByRole('button', {
      name: /Eliminar regla del hogar/,
    })
    expect(buttons).toHaveLength(2)
    expect(buttons[0].getAttribute('aria-label')).not.toBe(
      buttons[1].getAttribute('aria-label')
    )
    expect(screen.getByText(card('MONTEVIDEO'))).toBeTruthy()
    expect(screen.getByText(card('CARRASCO'))).toBeTruthy()
  })

  it('says "Hogar: No" for a rule that says no, and "1 transacción" in the singular', () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z', { isHousehold: false })])
    renderSection([makeTx({ id: 'a' })])
    expect(screen.getByText('Hogar: No')).toBeInTheDocument()
    expect(screen.getByText('1 transacción')).toBeInTheDocument()
  })

  it('lists rules newest first', () => {
    seed([
      rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z', {
        merchantOriginal: 'DEVOTO VIEJO',
      }),
      rule(DISCO_KEY, '2026-03-09T10:00:00.000Z', {
        merchantOriginal: 'DISCO NUEVO',
      }),
    ])
    renderSection()
    const names = screen
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    expect(names[0]).toContain('DISCO NUEVO')
    expect(names[1]).toContain('DEVOTO VIEJO')
  })

  it('falls back to the merchant key when the original name is missing', () => {
    seed([
      rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z', {
        merchantOriginal: undefined,
      }),
    ])
    renderSection()
    expect(screen.getByText(DEVOTO_KEY)).toBeInTheDocument()
  })

  it('counts only counted expenses of that merchant, not split parts or income', () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    renderSection([
      makeTx({ id: 'a' }),
      makeTx({ id: 'part', splitParentId: 'p' }),
      makeTx({ id: 'in', type: 'credit' }),
      makeTx({ id: 'other', description: 'TIENDA INGLESA' }),
    ])
    expect(screen.getByText('1 transacción')).toBeInTheDocument()
  })

  it('does not count rows with their own Hogar choice: the rule does not decide them', () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    renderSection([
      makeTx({ id: 'a' }),
      makeTx({ id: 'b', description: 'DEVOTO 19/03/2026' }),
      makeTx({ id: 'c', description: 'DEVOTO 26/03/2026', household: false }),
    ])
    expect(screen.getByText('2 transacciones')).toBeInTheDocument()
  })

  it('shows the empty line when there are no rules', () => {
    seed([])
    renderSection()
    expect(
      screen.getByText(
        'Todavía no hay reglas del hogar. Se crean desde una transacción, cuando elegís Hogar para todas las de un comercio.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('deleting a rule removes it at once and offers "Deshacer"', async () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    renderSection([makeTx()])

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar COMPRA DEVOTO 4521',
      })
    )

    await waitFor(() =>
      expect(screen.queryByText('COMPRA DEVOTO 4521')).not.toBeInTheDocument()
    )
    expect((await repo.loadWorkspace()).householdRules).toEqual([])
    expect(await screen.findByText('Regla eliminada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
  })

  it('after deleting, a row of that merchant follows its category again', async () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    const tx = makeTx() // Restaurantes: not household by category
    render(
      <>
        <HouseToggle
          transaction={tx}
          description={tx.description}
          disabled={false}
          onToggle={() => {}}
        />
        <HouseholdRulesSection transactions={[tx]} repository={repo} />
        <Toaster />
      </>
    )
    const toggle = screen.getByRole('button', {
      name: /^DEVOTO 12\/03\/2026: /,
    })
    expect(toggle).toHaveAccessibleName(/: Hogar · /)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar COMPRA DEVOTO 4521',
      })
    )

    await waitFor(() =>
      expect(toggle).toHaveAccessibleName(/: No es del hogar · /)
    )
  })

  it('"Deshacer" restores the rule with its value and name, in its place', async () => {
    seed([
      rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z', { isHousehold: false }),
      rule(DISCO_KEY, '2026-03-09T10:00:00.000Z', {
        merchantOriginal: 'DISCO',
      }),
    ])
    const tx = makeTx({ category: Category.Groceries }) // household by category
    render(
      <>
        <HouseToggle
          transaction={tx}
          description={tx.description}
          disabled={false}
          onToggle={() => {}}
        />
        <HouseholdRulesSection transactions={[tx]} repository={repo} />
        <Toaster />
      </>
    )
    const toggle = screen.getByRole('button', {
      name: /^DEVOTO 12\/03\/2026: /,
    })
    expect(toggle).toHaveAccessibleName(/: No es del hogar · /) // rule says no

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar COMPRA DEVOTO 4521',
      })
    )
    await waitFor(() => expect(toggle).toHaveAccessibleName(/: Hogar · /))

    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))

    await waitFor(() =>
      expect(toggle).toHaveAccessibleName(/: No es del hogar · /)
    )
    const names = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(names[1]).toContain('COMPRA DEVOTO 4521')
    expect(names[1]).toContain('Hogar: No')
    expect((await repo.loadWorkspace()).householdRules).toContainEqual(
      expect.objectContaining({
        merchantNormalized: DEVOTO_KEY,
        merchantOriginal: 'COMPRA DEVOTO 4521',
        isHousehold: false,
        createdAt: '2026-03-01T10:00:00.000Z',
      })
    )
  })

  it('a failed delete keeps the rule and shows a user-facing error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    repo.failOn('deleteHouseholdRule')
    renderSection([makeTx()])

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar COMPRA DEVOTO 4521',
      })
    )

    expect(
      await screen.findByText('No se pudo eliminar la regla')
    ).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
    expect(screen.getByText('COMPRA DEVOTO 4521')).toBeInTheDocument()
    expect(listHouseholdRuleRecords()).toHaveLength(1)
    expect((await repo.loadWorkspace()).householdRules).toHaveLength(1)
    // And the button works again.
    expect(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar COMPRA DEVOTO 4521',
      })
    ).toBeEnabled()
  })

  it('a rule saved elsewhere appears without remounting', () => {
    seed([])
    renderSection()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()

    act(() => putMerchantHouseholdRule(DISCO_KEY, false, 'DISCO 03/03'))

    expect(screen.getByText('DISCO 03/03')).toBeInTheDocument()
    expect(screen.getByText('Hogar: No')).toBeInTheDocument()
  })

  it('an undo after a user switch writes nothing and says why', async () => {
    seed([rule(DEVOTO_KEY, '2026-03-01T10:00:00.000Z')])
    renderSection([makeTx()])
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Eliminar regla del hogar COMPRA DEVOTO 4521',
      })
    )
    const undo = await screen.findByRole('button', { name: 'Deshacer' })
    act(() => workspaceStore.setState({ userId: 'someone-else' }))

    fireEvent.click(undo)

    expect(
      await screen.findByText(
        'La sesión cambió mientras se guardaba el cambio; no se muestra en esta cuenta.'
      )
    ).toBeInTheDocument()
    expect(repo.requests.upsertHouseholdRule).toBeUndefined()
    expect(listHouseholdRuleRecords()).toEqual([])
  })

  it('moves focus to the next rule after a delete, else the previous, else the heading', async () => {
    seed([
      rule(DEVOTO_KEY, '2026-03-09T10:00:00.000Z', { merchantOriginal: 'UNO' }),
      rule(DISCO_KEY, '2026-03-05T10:00:00.000Z', { merchantOriginal: 'DOS' }),
      rule('tata', '2026-03-01T10:00:00.000Z', { merchantOriginal: 'TRES' }),
    ])
    renderSection()
    const del = (name: string) =>
      screen.getByRole('button', { name: `Eliminar regla del hogar ${name}` })

    fireEvent.click(del('DOS'))
    await waitFor(() => expect(del('TRES')).toHaveFocus())

    fireEvent.click(del('TRES'))
    await waitFor(() => expect(del('UNO')).toHaveFocus())

    fireEvent.click(del('UNO'))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: 'Reglas del hogar' })
      ).toHaveFocus()
    )
  })
})
