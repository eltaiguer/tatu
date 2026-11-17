import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Transaction } from '../../models'
import {
  AFTER_EDIT,
  AFTER_EDIT_RULE_KEPT,
  useHouseholdWrites,
} from './useHouseholdWrites'
import {
  applyHouseholdToSimilar,
  forgetHouseholdRule,
  setHousehold,
} from '../../services/mutations/transaction-mutations'
import { createInMemoryRepository } from '../../services/repository/in-memory-repository'
import { merchantOverrideKey } from '../../services/categorizer/category-overrides'
import {
  clearHouseholdRules,
  loadHouseholdRules,
} from '../../services/household/household-rules-store'
import { transactionStore } from '../../stores/transaction-store'
import { workspaceStore } from '../../stores/workspace-state'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'

// 102 look-alikes of one merchant, 101 of them with an own choice: a rule
// clears those choices, which the repository writes in two chunks (100 + 1),
// so one chunk can fail alone.
const KEY = merchantOverrideKey('DEVOTO 11/03/2026') as string
const rows = (): Transaction[] =>
  Array.from({ length: 102 }, (_, i) => ({
    id: `d${String(i).padStart(3, '0')}`,
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: `DEVOTO ${10 + (i % 18)}/03/2026`,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'restaurants',
    ...(i > 0 ? { household: false } : {}),
    rawData: {},
  })) as Transaction[]

function setup(seed: Parameters<typeof createInMemoryRepository>[0] = {}) {
  const all = rows()
  const repo = createInMemoryRepository({ transactions: all, ...seed })
  transactionStore.getState().setTransactions(all)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  const reportError = vi.fn()
  const hook = renderHook(() =>
    useHouseholdWrites({
      transactions: transactionStore.getState().transactions,
      onSetHousehold: (ids, household) => setHousehold(repo, ids, household),
      onApplyHouseholdToSimilar: (id, household) =>
        applyHouseholdToSimilar(repo, id, household),
      onForgetHouseholdRule: (id, shown) =>
        forgetHouseholdRule(repo, id, shown),
      setPending: () => {},
      reportError,
    })
  )
  return { repo, reportError, hook }
}

const FAILURE = 'No se pudo guardar el cambio de Hogar'

describe('useHouseholdWrites — a partial write’s retry (#251, review 2)', () => {
  beforeEach(() => {
    clearHouseholdRules()
  })

  it('does not replay an old rule after a newer write of the same row', async () => {
    const { repo, reportError, hook } = setup()
    // The clears' second chunk fails once: "100 de 101 — reintentar". The rule
    // itself is saved first.
    repo.failOn('update', {
      when: (chunk) => chunk.includes('d101'),
      times: 1,
      error: new Error('429 too many requests'),
    })
    await act(async () => {
      await hook.result.current.writeHouseholdRule('d000', true, FAILURE)
    })
    const [error] = reportError.mock.calls[0]
    expect(error).toBeInstanceOf(PartialWriteError)
    expect(repo.householdRules.get(KEY)?.isHousehold).toBe(true)

    // The user then decides the other way for the same row.
    await act(async () => {
      await hook.result.current.writeHouseholdRule('d000', false, FAILURE)
    })
    expect(repo.householdRules.get(KEY)?.isHousehold).toBe(false)

    // The old "reintentar" must not bring the first decision back.
    const [reported] = reportError.mock.calls[0]
    await expect(
      (reported as PartialWriteError).retry!()
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(repo.householdRules.get(KEY)?.isHousehold).toBe(false)
  })

  const rule = {
    merchantNormalized: KEY,
    isHousehold: true,
    createdAt: '',
    updatedAt: '',
  }
  // A forget whose rule delete fails once: reported as a guarded partial write
  // whose retry replays the forget.
  async function failedForget() {
    const { repo, reportError, hook } = setup({ householdRules: [rule] })
    loadHouseholdRules([rule])
    repo.failOn('deleteHouseholdRule', {
      times: 1,
      error: new Error('429 too many requests'),
    })
    await act(async () => {
      await hook.result.current.forgetHouseholdRule('d000', true, FAILURE)
    })
    // The screen re-renders with the row the forget wrote.
    hook.rerender()
    const [error] = reportError.mock.calls[0]
    expect(error).toBeInstanceOf(PartialWriteError)
    expect(repo.householdRules.size).toBe(1)
    return { repo, reportError, hook, error: error as PartialWriteError }
  }

  it('forget: the Reintentar of a failed delete replays it while nothing else changed', async () => {
    const { repo, error } = await failedForget()

    await act(async () => {
      await error.retry!()
    })

    expect(repo.householdRules.size).toBe(0)
  })

  it('forget: an old Reintentar does not replay after a newer write of the row', async () => {
    const { repo, hook, error } = await failedForget()

    // The user then decides something else for the same row.
    await act(async () => {
      await hook.result.current.writeHousehold('d000', false, FAILURE)
    })
    hook.rerender()

    await expect(error.retry!()).rejects.toBeInstanceOf(UserFacingError)
    // The old retry did not delete the rule.
    expect(repo.householdRules.size).toBe(1)
  })

  it('forget: an old Reintentar does not replay once the row was changed elsewhere', async () => {
    const { repo, hook, error } = await failedForget()

    // Something that does not start a write of this view (the bulk bar).
    await act(async () => {
      await setHousehold(repo, ['d000'], false)
    })
    hook.rerender()

    await expect(error.retry!()).rejects.toBeInstanceOf(UserFacingError)
    expect(repo.householdRules.size).toBe(1)
  })

  it('after a saved edit, a forget that failed before the delete keeps the "pero no el de Hogar" prefix', async () => {
    const { reportError, hook } = setup()
    // The hook above has no way to fail the forget itself: drive it with a
    // missing row, which the mutation reports as an explained error.
    await act(async () => {
      await hook.result.current.saveHouseholdDraft(
        'gone',
        { kind: 'forget', household: true },
        'Devoto',
        'Cambios guardados'
      )
    })

    const [, , prefix] = reportError.mock.calls[0]
    expect(prefix).toBe(`${AFTER_EDIT}. `)
  })

  it('after a saved edit, a failed rule delete leads with the short prefix', async () => {
    const { repo, reportError, hook } = setup({ householdRules: [rule] })
    loadHouseholdRules([rule])
    repo.failOn('deleteHouseholdRule', { times: 1, error: new Error('boom') })

    await act(async () => {
      await hook.result.current.saveHouseholdDraft(
        'd000',
        { kind: 'forget', household: true },
        'Devoto',
        'Cambios guardados'
      )
    })

    const [, , prefix] = reportError.mock.calls[0]
    expect(prefix).toBe(AFTER_EDIT_RULE_KEPT)
  })
})
