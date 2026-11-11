import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Transaction } from '../../models'
import { useHouseholdWrites } from './useHouseholdWrites'
import {
  applyHouseholdToSimilar,
  setHousehold,
} from '../../services/mutations/transaction-mutations'
import { createInMemoryRepository } from '../../services/repository/in-memory-repository'
import { merchantOverrideKey } from '../../services/categorizer/category-overrides'
import { clearHouseholdRules } from '../../services/household/household-rules-store'
import { transactionStore } from '../../stores/transaction-store'
import { workspaceStore } from '../../stores/workspace-state'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'

// 102 look-alikes of one merchant: a future-only rule pins 101 rows, which the
// repository writes in two chunks (100 + 1), so one chunk can fail alone.
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
    rawData: {},
  })) as Transaction[]

function setup() {
  const all = rows()
  const repo = createInMemoryRepository({ transactions: all })
  transactionStore.getState().setTransactions(all)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  const reportError = vi.fn()
  const hook = renderHook(() =>
    useHouseholdWrites({
      transactions: transactionStore.getState().transactions,
      onSetHousehold: (ids, household) => setHousehold(repo, ids, household),
      onApplyHouseholdToSimilar: (id, household, scope) =>
        applyHouseholdToSimilar(repo, id, household, scope),
      setPending: () => {},
      reportError,
    })
  )
  return { repo, reportError, hook }
}

describe('useHouseholdWrites — a partial write’s retry (#251, review 2)', () => {
  beforeEach(() => {
    clearHouseholdRules()
  })

  it('does not replay an old rule after a newer write of the same row', async () => {
    const { repo, reportError, hook } = setup()
    // The pins' second chunk fails once: "100 de 101 — reintentar".
    repo.failOn('update', {
      when: (chunk) => chunk.includes('d101'),
      times: 1,
      error: new Error('429 too many requests'),
    })
    await act(async () => {
      await hook.result.current.writeHouseholdRule(
        'd000',
        true,
        'future_matching_only',
        'No se pudo guardar el gasto del hogar'
      )
    })
    const [error] = reportError.mock.calls[0]
    expect(error).toBeInstanceOf(PartialWriteError)
    expect(repo.householdRules.size).toBe(0)

    // The user then decides the other way for the same row.
    await act(async () => {
      await hook.result.current.writeHouseholdRule(
        'd000',
        false,
        'matching_past_and_future',
        'No se pudo guardar el gasto del hogar'
      )
    })
    expect(repo.householdRules.get(KEY)?.isHousehold).toBe(false)

    // The old "reintentar" must not bring the first decision back.
    const [reported] = reportError.mock.calls[0]
    await expect(
      (reported as PartialWriteError).retry!()
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(repo.householdRules.get(KEY)?.isHousehold).toBe(false)
  })
})
