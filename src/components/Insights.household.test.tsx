import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { Insights } from './Insights'
import type { Transaction, TransactionsFilter } from '../models'
import { Category } from '../models'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'
import { fakeClaudeClient } from '../test/fake-claude-client'
import { replaceCustomCategories } from '../services/categories/category-store'
import {
  clearHouseholdRules,
  putMerchantHouseholdRule,
} from '../services/household/household-rules-store'
import { merchantOverrideKey } from '../services/categorizer/category-overrides'
import { UserFacingError } from '../utils/user-error'

// Insights' Todo / Hogar mode (#251, step 8). The mode lives in the URL (App
// owns it, see App.test.tsx); here a tiny harness plays that part.

let seq = 0
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `i-${seq}`,
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: `Comercio ${seq}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category: Category.Groceries,
    rawData: {},
    ...overrides,
  }
}

// USD home. Household (seeded groceries): 100. Not household (restaurants):
// 60. Sin definir (uncategorized, no choice): 2 rows = 30 + 20.
function rows(): Transaction[] {
  return [
    tx({ id: 'super', description: 'Super Uno', amount: 100 }),
    tx({
      id: 'resto',
      description: 'Cantina',
      amount: 60,
      category: Category.Restaurants,
    }),
    tx({
      id: 'sd1',
      description: 'Kiosco',
      amount: 30,
      category: Category.Uncategorized,
    }),
    tx({
      id: 'sd2',
      description: 'Puesto',
      amount: 20,
      category: Category.Uncategorized,
    }),
    tx({
      id: 'pay',
      description: 'Sueldo',
      amount: 900,
      type: 'credit',
      category: Category.Income,
    }),
  ]
}

const TODO_ANSWER = JSON.stringify({
  insights: [
    {
      type: 'bleeding_money',
      title: 'Restaurantes pesa',
      narrative: 'Cantina es tu gasto personal.',
      amount: 60,
      category: Category.Restaurants,
      severity: 'high',
    },
  ],
})
const HOGAR_ANSWER = JSON.stringify({
  insights: [
    {
      type: 'bleeding_money',
      title: 'Súper domina el hogar',
      narrative: 'El súper es lo que más pesa en la casa.',
      amount: 100,
      category: Category.Groceries,
      severity: 'high',
    },
  ],
})

let repo: InMemoryRepository
let navigations: TransactionsFilter[]

function Harness({
  transactions,
  claudeClient,
  initialHousehold = false,
  noKey = false,
}: {
  noKey?: boolean
  transactions: Transaction[]
  claudeClient?: Parameters<typeof Insights>[0]['claudeClient']
  initialHousehold?: boolean
}) {
  const [household, setHousehold] = useState(initialHousehold)
  return (
    <Insights
      transactions={transactions}
      homeCurrency="USD"
      fxRate={40}
      repository={repo}
      aiEnabled={true}
      claudeApiKey={noKey ? '' : 'sk-test'}
      claudeClient={claudeClient}
      householdMode={household}
      onHouseholdModeChange={setHousehold}
      onNavigateToTransactions={(f) => navigations.push(f)}
      onNavigateToSettings={() => {}}
      onNavigateToCategories={() => {}}
    />
  )
}

function choose(name: 'Todo' | 'Hogar') {
  fireEvent.click(
    within(screen.getByRole('radiogroup', { name: 'Ver gastos' })).getByRole(
      'radio',
      { name }
    )
  )
}

// A client that answers per mode, optionally held until released.
function modeClient(hold?: Promise<void>) {
  return fakeClaudeClient(async (request) => {
    if (hold) await hold
    return request.user.includes('"scope":"hogar"') ? HOGAR_ANSWER : TODO_ANSWER
  })
}

function ruleKey(description: string): string {
  const key = merchantOverrideKey(description)
  if (!key) throw new Error(`no merchant key for "${description}"`)
  return key
}

// Unexpected failures are reported to the console by user-error.ts.
function expectLoggedErrors() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  return () => expect(spy).toHaveBeenCalled()
}

describe('Insights: Todo / Hogar mode', () => {
  beforeEach(() => {
    seq = 0
    navigations = []
    repo = createInMemoryRepository()
    replaceCustomCategories([])
    clearHouseholdRules()
  })

  it('offers Todo / Hogar, with Todo selected by default', async () => {
    render(<Harness transactions={rows()} />)
    await screen.findByRole('button', { name: /Generar/ })

    const group = screen.getByRole('radiogroup', { name: 'Ver gastos' })
    expect(within(group).getByRole('radio', { name: 'Todo' })).toBeChecked()
    expect(
      within(group).getByRole('radio', { name: 'Hogar' })
    ).not.toBeChecked()
  })

  it('sends Claude only the household figures in Hogar, with the household prompt', async () => {
    const client = modeClient()
    render(<Harness transactions={rows()} claudeClient={client} />)
    choose('Hogar')

    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))

    expect(await screen.findByText('Súper domina el hogar')).toBeVisible()
    expect(client.requests).toHaveLength(1)
    const [request] = client.requests
    expect(request.user).toContain('"scope":"hogar"')
    expect(request.user).toContain(Category.Groceries)
    expect(request.user).not.toContain(Category.Restaurants)
    expect(request.user).not.toContain('Cantina')
    expect(request.user).not.toContain('income')
    expect(request.system).toMatch(/household/i)
  })

  it('anchors the Hogar history on every imported month', async () => {
    const client = modeClient()
    const later = tx({
      id: 'later',
      date: new Date('2026-05-20T00:00:00.000Z'),
      category: Category.Restaurants,
    })
    render(
      <Harness
        transactions={[...rows(), later]}
        claudeClient={client}
        initialHousehold
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
    await screen.findByText('Súper domina el hogar')

    expect(client.requests[0].user).toContain('"historyEnd":"2026-05-20"')
    expect(client.requests[0].user).toContain('{"month":"2026-05","expense":0}')
  })

  it('caches Hogar apart from Todo', async () => {
    const client = modeClient()
    render(<Harness transactions={rows()} claudeClient={client} />)

    choose('Hogar')
    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
    await screen.findByText('Súper domina el hogar')

    await waitFor(() => expect(repo.householdInsights).not.toBeNull())
    expect(repo.insights).toBeNull()

    // Back in Todo there is nothing cached yet: the Hogar cards are gone.
    choose('Todo')
    expect(
      await screen.findByText('Generá tus primeros insights')
    ).toBeVisible()
    expect(screen.queryByText('Súper domina el hogar')).not.toBeInTheDocument()

    // And Hogar still has its own.
    choose('Hogar')
    expect(await screen.findByText('Súper domina el hogar')).toBeVisible()
  })

  it('does not mix modes when the mode changes during a generation', async () => {
    let release!: () => void
    const hold = new Promise<void>((resolve) => (release = resolve))
    const client = modeClient(hold)
    render(<Harness transactions={rows()} claudeClient={client} />)

    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
    await waitFor(() => expect(client.requests).toHaveLength(1))

    choose('Hogar')
    // The Todo generation is still running; Hogar can start its own.
    expect(await screen.findByRole('button', { name: /Generar/ })).toBeEnabled()

    await act(async () => {
      release()
      await hold
    })

    await waitFor(() => expect(repo.insights).not.toBeNull())
    expect(screen.queryByText('Restaurantes pesa')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generar/ })).toBeVisible()
    expect(repo.householdInsights).toBeNull()
    expect(repo.insights?.insights.insights[0].title).toBe('Restaurantes pesa')

    choose('Todo')
    expect(await screen.findByText('Restaurantes pesa')).toBeVisible()
  })

  it('does not show Todo cards in Hogar while its cache is being looked up', async () => {
    // Todo is cached; Hogar is not.
    const todoClient = modeClient()
    const { unmount } = render(
      <Harness transactions={rows()} claudeClient={todoClient} />
    )
    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
    await screen.findByText('Restaurantes pesa')
    unmount()

    render(<Harness transactions={rows()} />)
    await screen.findByText('Restaurantes pesa')
    choose('Hogar')

    expect(screen.queryByText('Restaurantes pesa')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Generar/ })).toBeVisible()
  })

  describe('staleness', () => {
    async function cacheBoth(transactions: Transaction[]) {
      const client = modeClient()
      const { unmount } = render(
        <Harness transactions={transactions} claudeClient={client} />
      )
      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await screen.findByText('Restaurantes pesa')
      choose('Hogar')
      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await screen.findByText('Súper domina el hogar')
      await waitFor(() => expect(repo.householdInsights).not.toBeNull())
      unmount()
    }

    it('a house click makes Hogar stale, not Todo', async () => {
      await cacheBoth(rows())

      // The user flags the restaurant row as household by hand.
      const changed = rows().map((t) =>
        t.id === 'resto' ? { ...t, household: true } : t
      )
      const { unmount } = render(
        <Harness transactions={changed} initialHousehold />
      )
      expect(await screen.findByText(/cambiaron/)).toBeVisible()
      unmount()

      render(<Harness transactions={changed} />)
      await screen.findByText('Restaurantes pesa')
      expect(screen.queryByText(/cambiaron/)).not.toBeInTheDocument()
    })

    it('leaves Hogar fresh when nothing household changed', async () => {
      await cacheBoth(rows())

      render(<Harness transactions={rows()} initialHousehold />)

      await screen.findByText('Súper domina el hogar')
      expect(screen.queryByText(/cambiaron/)).not.toBeInTheDocument()
    })
  })

  describe('Sin definir', () => {
    const line = 'Ver los gastos sin definir'

    it('says what is left out of the analysis, with count and amount, and opens it', async () => {
      render(<Harness transactions={rows()} initialHousehold />)

      const row = await screen.findByRole('button', { name: line })
      expect(row).toHaveTextContent('no entran en este análisis')
      expect(row).toHaveTextContent('US$ 50,00')
      expect(row).toHaveTextContent('2 gastos')
      // Amounts use the mono style.
      expect(within(row).getByText('US$ 50,00')).toHaveClass('font-mono')

      fireEvent.click(row)
      expect(navigations).toEqual([{ type: 'debit', household: 'unassigned' }])
    })

    it('uses the singular for one expense', async () => {
      render(
        <Harness
          transactions={rows().filter((t) => t.id !== 'sd2')}
          initialHousehold
        />
      )

      expect(
        await screen.findByRole('button', { name: line })
      ).toHaveTextContent('1 gasto')
    })

    it('shows above the Hogar empty state too', async () => {
      render(
        <Harness
          transactions={rows().filter((t) => t.id !== 'super')}
          initialHousehold
        />
      )

      expect(await screen.findByRole('button', { name: line })).toBeVisible()
      expect(screen.getByText('Todavía no hay gastos del hogar')).toBeVisible()
    })

    it('is hidden while the AI is not configured', async () => {
      render(<Harness transactions={rows()} initialHousehold noKey />)

      await screen.findByText('Activá la IA para ver insights')
      expect(
        screen.queryByRole('button', { name: line })
      ).not.toBeInTheDocument()
    })

    it('is a Hogar thing: Todo does not show it', async () => {
      render(<Harness transactions={rows()} />)
      await screen.findByRole('button', { name: /Generar/ })

      expect(
        screen.queryByRole('button', { name: line })
      ).not.toBeInTheDocument()
    })

    it('is left out when nothing is Sin definir', async () => {
      render(
        <Harness
          transactions={rows().filter((t) => !t.id.startsWith('sd'))}
          initialHousehold
        />
      )
      await screen.findByRole('button', { name: /Generar/ })

      expect(
        screen.queryByRole('button', { name: line })
      ).not.toBeInTheDocument()
    })
  })

  it('says there is no household spend yet, with no way to generate', async () => {
    render(
      <Harness
        transactions={rows().filter((t) => t.id !== 'super')}
        initialHousehold
      />
    )

    expect(
      await screen.findByText('Todavía no hay gastos del hogar')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /Generar/ })
    ).not.toBeInTheDocument()
    // Nothing to look up either.
    expect(repo.requests.loadInsights).toBeUndefined()
  })

  it('opens a Hogar card’s transactions inside the household', async () => {
    const client = modeClient()
    render(
      <Harness transactions={rows()} claudeClient={client} initialHousehold />
    )
    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
    await screen.findByText('Súper domina el hogar')

    fireEvent.click(screen.getByRole('button', { name: /Ver transacciones/ }))

    expect(navigations).toEqual([
      { category: Category.Groceries, household: 'household' },
    ])
  })

  it('opens a Todo card’s transactions without a household filter', async () => {
    const client = modeClient()
    render(<Harness transactions={rows()} claudeClient={client} />)
    fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
    await screen.findByText('Restaurantes pesa')

    fireEvent.click(screen.getByRole('button', { name: /Ver transacciones/ }))

    expect(navigations).toEqual([{ category: Category.Restaurants }])
  })

  describe('state per mode', () => {
    it('keeps a paid result and its failed save when the user left the mode meanwhile', async () => {
      let release!: () => void
      const hold = new Promise<void>((resolve) => (release = resolve))
      const client = modeClient(hold)
      repo.failOn('saveInsights', {
        error: new UserFacingError(
          'Falta crear la tabla de insights en la base de datos (ver supabase/README.md).'
        ),
      })
      render(<Harness transactions={rows()} claudeClient={client} />)

      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await waitFor(() => expect(client.requests).toHaveLength(1))
      choose('Hogar')
      await screen.findByRole('button', { name: /Generar/ })
      await act(async () => {
        release()
        await hold
      })

      choose('Todo')
      expect(await screen.findByText('Restaurantes pesa')).toBeVisible()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Falta crear la tabla de insights'
      )
    })

    it('shows each mode its own error', async () => {
      const client = fakeClaudeClient(async () => {
        throw new Error('boom')
      })
      render(<Harness transactions={rows()} claudeClient={client} />)
      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudieron generar los insights'
      )

      choose('Hogar')
      await screen.findByRole('button', { name: /Generar/ })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // Hogar fails on its own; Todo's error is still there when going back,
      // and Hogar's when returning.
      fireEvent.click(screen.getByRole('button', { name: /Generar/ }))
      expect(await screen.findByRole('alert')).toBeVisible()
      choose('Todo')
      expect(await screen.findByRole('alert')).toBeVisible()
      choose('Hogar')
      expect(await screen.findByRole('alert')).toBeVisible()
    })

    it('shows the stale banner for a result that finished after the data changed', async () => {
      let release!: () => void
      const hold = new Promise<void>((resolve) => (release = resolve))
      const client = modeClient(hold)
      const view = render(
        <Harness transactions={rows()} claudeClient={client} />
      )

      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await waitFor(() => expect(client.requests).toHaveLength(1))
      view.rerender(
        <Harness
          transactions={[...rows(), tx({ id: 'late', amount: 5 })]}
          claudeClient={client}
        />
      )
      await act(async () => {
        release()
        await hold
      })

      expect(await screen.findByText('Restaurantes pesa')).toBeVisible()
      expect(screen.getByText(/cambiaron/)).toBeVisible()
    })
  })

  describe('another user’s repository', () => {
    it('never receives a generation that finishes after the user changed', async () => {
      let release!: () => void
      const hold = new Promise<void>((resolve) => (release = resolve))
      const client = modeClient(hold)
      const first = repo
      const second = createInMemoryRepository()
      const view = render(
        <Harness transactions={rows()} claudeClient={client} />
      )

      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await waitFor(() => expect(client.requests).toHaveLength(1))

      repo = second
      view.rerender(<Harness transactions={rows()} claudeClient={client} />)
      await screen.findByRole('button', { name: /Generar/ })
      await act(async () => {
        release()
        await hold
      })

      await waitFor(() => expect(first.insights).not.toBeNull())
      expect(second.insights).toBeNull()
      // The late result did not reset what the new user's view knew.
      expect(second.requests.loadInsights).toBe(1)
      // The new user sees nothing of it, and can generate their own.
      expect(screen.queryByText('Restaurantes pesa')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Generar/ })).toBeEnabled()
    })
  })

  describe('a failed cache lookup', () => {
    it.each([
      ['Todo', false],
      ['Hogar', true],
    ])('still offers Generar in %s', async (_name, household) => {
      const logged = expectLoggedErrors()
      repo.failOn('loadInsights')
      render(<Harness transactions={rows()} initialHousehold={household} />)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudieron cargar los insights'
      )
      expect(screen.getByRole('button', { name: /Generar/ })).toBeVisible()
      logged()
    })
  })

  describe('household rules', () => {
    it('a merchant rule alone makes Hogar stale and leaves Todo fresh', async () => {
      const client = modeClient()
      const first = render(
        <Harness transactions={rows()} claudeClient={client} />
      )
      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await screen.findByText('Restaurantes pesa')
      choose('Hogar')
      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await screen.findByText('Súper domina el hogar')
      await waitFor(() => expect(repo.householdInsights).not.toBeNull())

      // The rule changes who is household; no row is written.
      act(() => putMerchantHouseholdRule(ruleKey('Cantina'), true))

      expect(await screen.findByText(/cambiaron/)).toBeVisible()
      first.unmount()
      render(<Harness transactions={rows()} />)
      await screen.findByText('Restaurantes pesa')
      expect(screen.queryByText(/cambiaron/)).not.toBeInTheDocument()
    })

    it('a rule saved while in Todo does not look the cache up again', async () => {
      render(<Harness transactions={rows()} />)
      await screen.findByRole('button', { name: /Generar/ })
      const lookups = repo.requests.loadInsights

      act(() => putMerchantHouseholdRule(ruleKey('Cantina'), true))

      expect(repo.requests.loadInsights).toBe(lookups)
    })

    it('a rule saved while in Todo leaves a Todo error on screen', async () => {
      const client = fakeClaudeClient(async () => {
        throw new Error('boom')
      })
      render(<Harness transactions={rows()} claudeClient={client} />)
      fireEvent.click(await screen.findByRole('button', { name: /Generar/ }))
      await screen.findByRole('alert')

      act(() => putMerchantHouseholdRule(ruleKey('Cantina'), true))

      expect(screen.getByRole('alert')).toBeVisible()
    })
  })
})
