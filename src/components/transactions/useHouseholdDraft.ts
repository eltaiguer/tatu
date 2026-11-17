import { useMemo, useState } from 'react'
import type { Transaction } from '../../models'
import { getDisplayDescription } from '../../utils/transaction-display'
import {
  isCategoryHousehold,
  currentHouseholdRules,
  canHaveMerchantRule,
  merchantRule as merchantRuleOf,
  resolveHousehold,
  rowHouseholdView,
} from '../../services/household/household'

export type HouseholdChoice = 'category' | 'yes' | 'no'

const choiceOf = (household: boolean | null | undefined): HouseholdChoice =>
  household === true ? 'yes' : household === false ? 'no' : 'category'

const householdOf = (choice: HouseholdChoice): boolean | null =>
  choice === 'yes' ? true : choice === 'no' ? false : null

// What the household part of a save writes. The dialog decides the kind, and
// "untouched" is `none`: a category edit must not create or delete a rule, nor
// wipe a hand-set choice.
export type HouseholdWrite =
  // Nothing household is written.
  | { kind: 'none' }
  // This row's own choice (null follows its category); no rule involved.
  | { kind: 'row'; household: boolean | null }
  // "Recordar para todas las de …" checked: the merchant's rule, applied to
  // every similar row.
  | { kind: 'rule'; household: boolean }
  // The box started checked and was unchecked: the value on screen for this
  // row (null follows its category), then the rule is deleted.
  | { kind: 'forget'; household: boolean | null }

/**
 * The edit dialog's Hogar draft: the picks, what the group and the box show,
 * and what a save writes (`toWrite`). Fed the category being picked, so it
 * follows the dialog's category picker.
 */
export function useHouseholdDraft({
  transaction,
  category,
  canSetHousehold,
  canSetHouseholdRule,
  countHouseholdSimilar,
}: {
  transaction: Transaction
  category: string
  canSetHousehold: boolean
  canSetHouseholdRule: boolean
  countHouseholdSimilar: (transaction: Transaction) => number
}) {
  // The Hogar choice is held as picks, never as derived values: `ownPick` is
  // the row's own choice while the box is unchecked, `rulePick` the merchant's
  // rule while it is checked (a rule is always a Sí or a No, so "Según …" is
  // not offered then). null = not picked yet.
  const [ownPick, setOwnPick] = useState<HouseholdChoice | null>(null)
  const [rulePick, setRulePick] = useState<'yes' | 'no' | null>(null)
  // Only counted expenses can be household. Read while rendering (never
  // copied into state) so the label follows the category picker above and a
  // default changed in Categorías.
  const householdRules = currentHouseholdRules()
  // Judged on the category being picked, not the saved one: an ignored
  // category has no house, and an ignored row given a counted one gets it.
  const showHousehold =
    canSetHousehold &&
    rowHouseholdView(
      { ...transaction, category: category.trim() || undefined },
      householdRules
    ) !== null
  const categoryDefaultLabel = isCategoryHousehold(category, householdRules)
    ? 'Sí'
    : 'No'
  // A rule can be made only for a counted expense (judged on the category
  // being picked) that is not a split part and has a merchant key, and only
  // when the view can save one. Elsewhere the box is not offered, and the
  // dialog says the choice is this row's only.
  const canMakeRule =
    showHousehold && canSetHouseholdRule && canHaveMerchantRule(transaction)
  const merchantRule = merchantRuleOf(transaction, householdRules.merchants)
  const draftRow = useMemo(
    () => ({ ...transaction, category: category.trim() || undefined }),
    [transaction, category]
  )
  const householdSimilarCount = useMemo(
    () => countHouseholdSimilar(draftRow),
    [countHouseholdSimilar, draftRow]
  )
  // Whether a rule covered the row when the dialog opened: the box starts
  // checked then. Fixed at open (the rules are read here without a
  // subscription, and a toast action can write one while the dialog is
  // open). A row whose own choice contradicts the rule is not covered by it:
  // the box starts unchecked on that choice. Independent of the category at
  // open: a row opened in an ignored category and moved to a counted one is
  // still decided by its rule (the box's visibility follows `canMakeRule`).
  const [startedRemembered] = useState(
    () =>
      canSetHouseholdRule &&
      canHaveMerchantRule(transaction) &&
      merchantRule !== undefined &&
      (transaction.household == null || transaction.household === merchantRule)
  )
  const [remember, setRemember] = useState(startedRemembered)
  const remembered = canMakeRule && remember
  // What the row shows now, given the pending own choice and the category
  // being picked: what checking the box preselects.
  const shownNow: 'yes' | 'no' =
    ownPick === 'yes' || ownPick === 'no'
      ? ownPick
      : resolveHousehold(
            {
              ...draftRow,
              household: ownPick === 'category' ? null : transaction.household,
            },
            householdRules
          ).status === 'household'
        ? 'yes'
        : 'no'
  // Unchecked, the radio is the row's own choice: where it started is the
  // rule's value when the rule covered it.
  const ownStart: HouseholdChoice = startedRemembered
    ? choiceOf(merchantRule)
    : choiceOf(transaction.household)
  const shownChoice: HouseholdChoice = remembered
    ? (rulePick ?? (startedRemembered ? choiceOf(merchantRule) : shownNow))
    : (ownPick ?? ownStart)
  // The "follow" option is the merchant's only while a rule survives this
  // save; a box that started checked deletes it when unchecked.
  const followLabel =
    merchantRule !== undefined && !startedRemembered
      ? `Según comercio (${merchantRule ? 'Sí' : 'No'})`
      : `Según categoría (${categoryDefaultLabel})`
  const pickHousehold = (choice: HouseholdChoice) =>
    remembered
      ? setRulePick(choice === 'category' ? null : choice)
      : setOwnPick(choice)
  // What the radio shows is what is saved: a pick carries across the box in
  // both directions. A preselect alone does not, so checking then unchecking
  // writes nothing; a "Según …" does not either (follow vs delete the rule).
  function toggleRemember(next: boolean) {
    if (next)
      setRulePick(ownPick === 'yes' || ownPick === 'no' ? ownPick : null)
    else if (rulePick !== null) setOwnPick(rulePick)
    setRemember(next)
  }

  function toWrite(): HouseholdWrite {
    if (!showHousehold) return { kind: 'none' }
    if (remembered) {
      if (startedRemembered) {
        // Only a value different from the rule's is a change: re-picking the
        // one on screen must not clear the exceptions it never showed.
        return rulePick === null || rulePick === choiceOf(merchantRule)
          ? { kind: 'none' }
          : { kind: 'rule', household: rulePick === 'yes' }
      }
      return { kind: 'rule', household: shownChoice === 'yes' }
    }
    if (canMakeRule && startedRemembered) {
      return { kind: 'forget', household: householdOf(shownChoice) }
    }
    if (ownPick === null || ownPick === choiceOf(transaction.household)) {
      return { kind: 'none' }
    }
    return { kind: 'row', household: householdOf(ownPick) }
  }

  return {
    show: showHousehold,
    canMakeRule,
    remembered,
    remember,
    shownChoice,
    followLabel,
    pick: pickHousehold,
    toggleRemember,
    toWrite,
    rememberLabel: `Recordar para todas las de ${getDisplayDescription(transaction)}`,
    hint:
      startedRemembered && !remember
        ? 'Al guardar, se deja de recordar'
        : householdSimilarCount > 1
          ? `Se aplica a ${householdSimilarCount} transacciones y a las que importes`
          : 'Por ahora solo esta, y las que importes',
  }
}

export type HouseholdDraft = ReturnType<typeof useHouseholdDraft>
