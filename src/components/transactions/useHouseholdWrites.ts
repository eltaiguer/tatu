import { useRef } from 'react'
import { toast } from 'sonner'
import type { Transaction } from '../../models'
import {
  currentHouseholdRules,
  nextHouseholdChoice,
  resolveHousehold,
  rowsChangedByRule,
} from '../../services/household/household'
import type { RuleScope } from '../../services/mutations/transaction-mutations'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'
import type { TransactionsProps } from './transactions-props'

const SUPERSEDED =
  'Mientras tanto se hizo otro cambio en esta transacción; no se reintentó.'
export const AFTER_EDIT = 'Se guardaron los cambios, pero no el gasto del hogar'

/**
 * Every household write the Transacciones view starts: the row's house, the
 * edit dialog's choice and the merchant rule, with the toasts around them
 * (the "Aplicar a las N similares" offer, retries). One counter per row marks
 * the newest write, so an old toast's action or retry never replays a click
 * that was since superseded. Like useBulkActions, it reports through the
 * view's `reportError` and marks rows busy through its `setPending`.
 */
export function useHouseholdWrites({
  transactions,
  onSetHousehold,
  onApplyHouseholdToSimilar,
  setPending,
  reportError,
}: {
  transactions: Transaction[]
  onSetHousehold: TransactionsProps['onSetHousehold']
  onApplyHouseholdToSimilar: TransactionsProps['onApplyHouseholdToSimilar']
  setPending: (transactionId: string, pending: boolean) => void
  reportError: (
    error: unknown,
    fallback: string,
    prefix?: string,
    retry?: () => void
  ) => void
}) {
  // The newest household write started per row, so an old toast's retry can
  // tell it has been superseded.
  const householdWrites = useRef(new Map<string, number>())
  // The toast offering "Aplicar a las N similares", per row, while it shows.
  const offers = useRef(new Map<string, string | number>())
  // The latest rows, to see whether a row changed after a failed write.
  const transactionsRef = useRef(transactions)
  transactionsRef.current = transactions
  const rowChoice = (id: string) =>
    transactionsRef.current.find((tx) => tx.id === id)?.household ?? null
  // Starts a household write of a row: any earlier offer of the row is
  // withdrawn (its action would replay an old click) and the returned number
  // marks this write as the newest.
  const startHouseholdWrite = (id: string) => {
    const seq = (householdWrites.current.get(id) ?? 0) + 1
    householdWrites.current.set(id, seq)
    // Only an offer that was shown, by its own id: dismissing an id that has
    // no toast yet would dismiss the next toast made with it.
    const offer = offers.current.get(id)
    if (offer !== undefined) {
      toast.dismiss(offer)
      offers.current.delete(id)
    }
    return seq
  }
  // A partial write brings its own "reintentar" (the failed remainder): it
  // gets the same guard, so an old one cannot replay a decision that was
  // since changed. Other errors pass through (their retry is ours).
  const guarded = (
    error: unknown,
    id: string,
    seq: number,
    held: boolean | null
  ) => {
    if (!(error instanceof PartialWriteError) || !error.retry) return error
    const retry = error.retry
    return new PartialWriteError(
      error.message,
      error.done,
      error.total,
      () =>
        mayReplay(id, seq, held)
          ? retry()
          : Promise.reject(new UserFacingError(SUPERSEDED)),
      error.result,
      error.cause
    )
  }
  // Whether nothing else wrote the row since `seq` and it still holds what it
  // did when `heldWhenFailed` was read: only then may an old retry run.
  const mayReplay = (id: string, seq: number, held: boolean | null) =>
    householdWrites.current.get(id) === seq && rowChoice(id) === held

  // One click flips the row's house. Quiet on success: the house moves when
  // the saved row comes back from the store.
  // When other rows of the merchant would change if it became a rule, the
  // toast after a saved click offers "Aplicar a las N similares".
  async function handleToggleHousehold(transaction: Transaction) {
    const rules = currentHouseholdRules()
    const choice = nextHouseholdChoice(transaction, rules)
    const saved = await writeHousehold(
      transaction.id,
      choice,
      'No se pudo guardar el gasto del hogar'
    )
    if (!saved || !onApplyHouseholdToSimilar || transaction.splitParentId) {
      return
    }
    // The row as the write left it; the others as they were on the click.
    const after = resolveHousehold({ ...transaction, household: choice }, rules)
    if (after.status === 'unassigned') return
    const value = after.status === 'household'
    const others = rowsChangedByRule(
      transactions,
      transaction,
      value,
      rules,
      true
    ).filter((row) => row.id !== transaction.id).length
    if (others < 1) return
    const offered = householdWrites.current.get(transaction.id)
    const offer = toast(
      value
        ? 'Transacción marcada como hogar'
        : 'Transacción marcada como no hogar',
      {
        duration: 8000,
        action: {
          label:
            others === 1
              ? 'Aplicar a la otra similar'
              : `Aplicar a las ${others} similares`,
          onClick: () => {
            // A newer click or write of the row withdrew this offer.
            if (householdWrites.current.get(transaction.id) !== offered) return
            void applyToSimilar(transaction.id, value, others)
          },
        },
      }
    )
    offers.current.set(transaction.id, offer)
  }

  async function applyToSimilar(id: string, value: boolean, others: number) {
    if (!onApplyHouseholdToSimilar) return
    const seq = startHouseholdWrite(id)
    try {
      await onApplyHouseholdToSimilar(id, value, 'matching_past_and_future')
      toast.success(
        others === 1
          ? 'Se aplicó a la otra similar'
          : `Se aplicó a ${others} transacciones`
      )
    } catch (error) {
      const held = rowChoice(id)
      reportError(
        guarded(error, id, seq, held),
        'No se pudo aplicar a las similares',
        '',
        () => {
          if (mayReplay(id, seq, held)) void applyToSimilar(id, value, others)
        }
      )
    }
  }

  // Writes one row's choice; true when it saved. A failure that saved nothing
  // offers the same write again, but only if nothing else touched the row
  // since: no newer write of this view started (the counter) and the saved
  // row still holds what it did when this one failed (which also covers bulk
  // writes and the dialog). A newer choice is never overwritten by an old
  // toast.
  async function writeHousehold(
    id: string,
    household: boolean | null,
    failure: string
  ): Promise<boolean> {
    if (!onSetHousehold) return false
    const seq = startHouseholdWrite(id)
    setPending(id, true)
    try {
      await onSetHousehold([id], household)
      return true
    } catch (error) {
      const heldWhenFailed = rowChoice(id)
      // After a saved edit, say so even when the error brings its own words.
      const prefix =
        failure === AFTER_EDIT && error instanceof UserFacingError
          ? `${AFTER_EDIT}. `
          : ''
      reportError(
        guarded(error, id, seq, heldWhenFailed),
        failure,
        prefix,
        () => {
          if (mayReplay(id, seq, heldWhenFailed)) {
            void writeHousehold(id, household, failure)
          }
        }
      )
      return false
    } finally {
      setPending(id, false)
    }
  }

  // Saves the merchant's household rule from the edit dialog and applies it
  // to the similar rows; resolves with how many rows it reaches, or null when
  // it failed (reported). A failure that saved nothing offers the same write
  // again; a partial one offers to retry just the rest.
  async function writeHouseholdRule(
    id: string,
    household: boolean | null,
    scope: RuleScope,
    failure: string
  ): Promise<number | null> {
    if (!onApplyHouseholdToSimilar) return null
    const seq = startHouseholdWrite(id)
    setPending(id, true)
    try {
      const { affected } = await onApplyHouseholdToSimilar(id, household, scope)
      return affected
    } catch (error) {
      const prefix =
        failure === AFTER_EDIT && error instanceof UserFacingError
          ? `${AFTER_EDIT}. `
          : ''
      const held = rowChoice(id)
      reportError(guarded(error, id, seq, held), failure, prefix, () => {
        if (mayReplay(id, seq, held)) {
          void writeHouseholdRule(id, household, scope, failure)
        }
      })
      return null
    } finally {
      setPending(id, false)
    }
  }

  return { handleToggleHousehold, writeHousehold, writeHouseholdRule }
}
