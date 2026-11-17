import { useRef } from 'react'
import { toast, type ExternalToast } from 'sonner'
import type { Transaction } from '../../models'
import type { HouseholdWrite } from './useHouseholdDraft'
import {
  currentHouseholdRules,
  nextHouseholdChoice,
  resolveHousehold,
  rowsChangedByRule,
} from '../../services/household/household'
import {
  RuleDeleteFailedError,
  type ForgetResult,
} from '../../services/mutations/transaction-mutations'
import { PartialWriteError, UserFacingError } from '../../utils/user-error'
import type { TransactionsProps } from './transactions-props'

const SUPERSEDED =
  'Mientras tanto se hizo otro cambio en esta transacción; no se reintentó.'
export const AFTER_EDIT = 'Se guardaron los cambios, pero no el gasto del hogar'
// Leads a failed rule delete after a saved edit: its message already says the
// row saved, so "pero no el gasto del hogar" would contradict it.
export const AFTER_EDIT_RULE_KEPT = 'Se guardaron los cambios. '

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
  onForgetHouseholdRule,
  setPending,
  reportError,
}: {
  transactions: Transaction[]
  onSetHousehold: TransactionsProps['onSetHousehold']
  onApplyHouseholdToSimilar: TransactionsProps['onApplyHouseholdToSimilar']
  onForgetHouseholdRule: TransactionsProps['onForgetHouseholdRule']
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
    const value = after.status === 'household'
    const others = rowsChangedByRule(
      transactions,
      transaction,
      value,
      rules
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
            // A newer click or write of the row withdrew this offer, and so did
            // a write that does not start one here (the bulk bar): the row
            // must still hold the choice this click wrote.
            if (
              householdWrites.current.get(transaction.id) !== offered ||
              rowChoice(transaction.id) !== choice
            ) {
              return
            }
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
      await onApplyHouseholdToSimilar(id, value)
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

  // Runs one household write of a row, reporting a failure. A failure that
  // saved nothing offers the same write again (`again`), but only if nothing
  // else touched the row since: no newer write of this view started (the
  // counter) and the saved row still holds what it did when this one failed
  // (which also covers bulk writes and the dialog). A newer choice is never
  // overwritten by an old toast. Resolves with the write's result, or null
  // when it failed (reported).
  async function guardedWrite<T>(
    id: string,
    failure: string,
    run: () => Promise<T>,
    again: () => Promise<unknown>
  ): Promise<{ value: T } | null> {
    const seq = startHouseholdWrite(id)
    setPending(id, true)
    try {
      return { value: await run() }
    } catch (error) {
      // A failed rule delete knows the value its forget wrote; any other
      // failure reads the row's choice as the screen has it.
      const heldWhenFailed =
        error instanceof RuleDeleteFailedError ? error.kept : rowChoice(id)
      // After a saved edit, say so even when the error brings its own words.
      const prefix =
        failure !== AFTER_EDIT || !(error instanceof UserFacingError)
          ? ''
          : error instanceof RuleDeleteFailedError
            ? AFTER_EDIT_RULE_KEPT
            : `${AFTER_EDIT}. `
      reportError(
        guarded(error, id, seq, heldWhenFailed),
        failure,
        prefix,
        () => {
          if (mayReplay(id, seq, heldWhenFailed)) void again()
        }
      )
      return null
    } finally {
      setPending(id, false)
    }
  }

  // Writes one row's choice; true when it saved.
  async function writeHousehold(
    id: string,
    household: boolean | null,
    failure: string
  ): Promise<boolean> {
    if (!onSetHousehold) return false
    const done = await guardedWrite(
      id,
      failure,
      () => onSetHousehold([id], household),
      () => writeHousehold(id, household, failure)
    )
    return done !== null
  }

  // Saves the merchant's household rule from the edit dialog and applies it
  // to the similar rows; resolves with how many rows it reaches, or null when
  // it failed (reported). A partial failure offers to retry just the rest.
  async function writeHouseholdRule(
    id: string,
    household: boolean,
    failure: string
  ): Promise<number | null> {
    if (!onApplyHouseholdToSimilar) return null
    const done = await guardedWrite(
      id,
      failure,
      () => onApplyHouseholdToSimilar(id, household),
      () => writeHouseholdRule(id, household, failure)
    )
    return done ? done.value.affected : null
  }

  // The edit dialog's unchecked "Recordar…": the row keeps `shown`, then the
  // merchant's rule is deleted. Resolves with what the forget did, or null
  // when it failed (reported).
  async function forgetHouseholdRule(
    id: string,
    shown: boolean | null,
    failure: string
  ): Promise<ForgetResult | null> {
    if (!onForgetHouseholdRule) return null
    const done = await guardedWrite(
      id,
      failure,
      () => onForgetHouseholdRule(id, shown),
      () => forgetHouseholdRule(id, shown, failure)
    )
    return done ? done.value : null
  }

  // Whether the view can write this kind of household change.
  const canSaveHousehold = (write: HouseholdWrite) =>
    write.kind === 'row'
      ? Boolean(onSetHousehold)
      : write.kind === 'rule'
        ? Boolean(onApplyHouseholdToSimilar)
        : write.kind === 'forget'
          ? Boolean(onForgetHouseholdRule)
          : false

  // The household part of the edit dialog's save, after its category edit
  // (`message` is that edit's success, null for a household-only save). One
  // outcome is reported: `saved` false means a failure was reported, and
  // `message` is what to toast otherwise (one toast, with its options).
  async function saveHouseholdDraft(
    id: string,
    write: HouseholdWrite,
    name: string,
    message: string | null
  ): Promise<{
    saved: boolean
    message: string | null
    options?: ExternalToast
  }> {
    const failure = message
      ? AFTER_EDIT
      : 'No se pudo guardar el gasto del hogar'
    if (write.kind === 'rule') {
      // The checked box: the merchant's rule, applied to the similar rows.
      const applied = await writeHouseholdRule(id, write.household, failure)
      if (applied === null) return { saved: false, message: null }
      if (!message) {
        return {
          saved: true,
          message:
            applied > 1
              ? `Se aplicó a ${applied} transacciones`
              : 'Cambios guardados',
        }
      }
      return {
        saved: true,
        message:
          applied > 1 ? `${message} · gasto del hogar en ${applied}` : message,
      }
    }
    if (write.kind === 'forget') {
      // The unchecked box: the row keeps its value, the rule goes. Rules
      // vanish without any row changing visibly, so it says so and can undo.
      const forgot = await forgetHouseholdRule(id, write.household, failure)
      if (forgot === null) return { saved: false, message: null }
      const { reached, undo } = forgot
      if (!undo) return { saved: true, message }
      return {
        saved: true,
        message: message
          ? `${message} · ya no se recuerda ${name}`
          : `Ya no se recuerda ${name}`,
        options: {
          description:
            reached > 0
              ? `${reached === 1 ? '1 transacción vuelve' : `${reached} transacciones vuelven`} a su categoría`
              : undefined,
          action: {
            label: 'Deshacer',
            onClick: () => {
              undo().catch((error: unknown) =>
                reportError(error, 'No se pudo deshacer')
              )
            },
          },
        },
      }
    }
    if (write.kind === 'none') return { saved: true, message }
    const saved = await writeHousehold(id, write.household, failure)
    return { saved, message: saved ? message : null }
  }

  return {
    handleToggleHousehold,
    canSaveHousehold,
    saveHouseholdDraft,
    writeHousehold,
    writeHouseholdRule,
    forgetHouseholdRule,
  }
}
