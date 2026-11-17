import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { RadioGroup } from './ui/radio-group'
import { Checkbox } from './ui/checkbox'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { CategoryBadge } from './CategoryBadge'
import { Category } from '../models'
import type { Currency, Transaction } from '../models'
import { formatCurrency, formatDate } from '../utils/formatting'
import { getDisplayDescription } from '../utils/transaction-display'
import {
  buildCategorySuggestions,
  buildTagSuggestions,
  filterCategorySuggestions,
  filterTagSuggestions,
} from '../services/suggestions/suggestions'
import { getAccountLabel } from './TransactionTable'
import {
  isCategoryHousehold,
  currentHouseholdRules,
  canHaveMerchantRule,
  merchantRule as merchantRuleOf,
  resolveHousehold,
  rowHouseholdView,
} from '../services/household/household'

type HouseholdChoice = 'category' | 'yes' | 'no'

const choiceOf = (household: boolean | null | undefined): HouseholdChoice =>
  household === true ? 'yes' : household === false ? 'no' : 'category'

const householdOf = (choice: HouseholdChoice): boolean | null =>
  choice === 'yes' ? true : choice === 'no' ? false : null

export type ApplyScope =
  | 'single'
  | 'matching_past_and_future'
  | 'future_matching_only'

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

// What the user saved. `description` is trimmed and never empty;
// `category` is null for "sin categoría", which clears it (on the server
// too, #119).
export interface EditTransactionDraft {
  description: string
  category: string | null
  tags: string[]
  // What the name and category reach. The Hogar choice has no scope: its box
  // is the merchant rule.
  applyScope: ApplyScope
  // The Hogar choice. It has no scope of its own: the "Recordar para todas las
  // de …" checkbox makes it the merchant's rule.
  household: HouseholdWrite
}

interface EditTransactionDialogProps {
  // The row being edited; null closes the dialog. Each transaction starts a
  // fresh draft.
  transaction: Transaction | null
  // Rows an apply-to-similar edit of `transaction` would visibly change
  // (countSimilarEditReach), given whether the draft renames it. Takes the
  // row so the count holds while the dialog animates closed.
  countSimilar: (transaction: Transaction, renamed: boolean) => number
  // Tags already in use, offered as suggestions.
  knownTags: string[]
  isSaving: boolean
  // Counted rows a merchant household rule would reach (rowsSharingMerchantRule),
  // for the "Recordar para todas las de …" hint.
  countHouseholdSimilar: (transaction: Transaction) => number
  // Whether the view can save a household choice; without it the group is
  // not offered.
  canSetHousehold: boolean
  // Whether the view can save a merchant household rule; without it the
  // household choice is this row's only.
  canSetHouseholdRule: boolean
  // Persists a new category; resolves with it, or undefined when it could
  // not be created (the caller reports why).
  onCreateCategory: (label: string) => Promise<{ id: string } | undefined>
  // Called with a valid draft. The caller closes the dialog on success.
  onSave: (draft: EditTransactionDraft) => void
  onClose: () => void
}

export function EditTransactionDialog({
  transaction,
  onClose,
  ...formProps
}: EditTransactionDialogProps) {
  // Keeps the last transaction on screen while the dialog animates closed,
  // and counts openings so reopening the same row starts a fresh draft.
  const [seen, setSeen] = useState({
    prop: transaction,
    shown: transaction,
    opens: 0,
  })
  if (seen.prop !== transaction) {
    setSeen({
      prop: transaction,
      shown: transaction ?? seen.shown,
      opens: transaction && !seen.prop ? seen.opens + 1 : seen.opens,
    })
  }
  const shown = seen.shown

  return (
    <Dialog
      open={transaction !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        {shown ? (
          <EditTransactionForm
            key={`${shown.id}:${seen.opens}`}
            transaction={shown}
            onClose={onClose}
            {...formProps}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Editar transacción</DialogTitle>
            <DialogDescription>
              Actualizá descripción visible, categoría y etiquetas.
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditTransactionForm({
  transaction,
  countSimilar,
  countHouseholdSimilar,
  knownTags,
  isSaving,
  canSetHousehold,
  canSetHouseholdRule,
  onCreateCategory,
  onSave,
  onClose,
}: Omit<EditTransactionDialogProps, 'transaction'> & {
  transaction: Transaction
}) {
  const [description, setDescription] = useState(() =>
    getDisplayDescription(transaction)
  )
  const [category, setCategory] = useState(transaction.category ?? '')
  const [tags, setTags] = useState<string[]>(transaction.tags ?? [])
  const [applyScope, setApplyScope] = useState<ApplyScope>('single')
  // The Hogar choice is held as picks, never as derived values: `ownPick` is
  // the row's own choice while the box is unchecked, `rulePick` the merchant's
  // rule while it is checked (a rule is always a Sí or a No, so "Según …" is
  // not offered then). null = not picked yet.
  const [ownPick, setOwnPick] = useState<HouseholdChoice | null>(null)
  const [rulePick, setRulePick] = useState<'yes' | 'no' | null>(null)
  const [error, setError] = useState('')
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')

  // "Renamed" exactly as the save decides it, so the number shown is the
  // number of rows the save will touch.
  const name = description.trim()
  const renamed = !!name && name !== transaction.description
  const similarCount = useMemo(
    () => countSimilar(transaction, renamed),
    [countSimilar, transaction, renamed]
  )

  const categorySuggestions = useMemo(
    () =>
      filterCategorySuggestions(
        buildCategorySuggestions([category]).filter(
          (id) => id !== Category.Uncategorized
        ),
        categoryQuery
      ),
    [category, categoryQuery]
  )

  const tagSuggestions = useMemo(
    () =>
      filterTagSuggestions(
        buildTagSuggestions([...knownTags, ...tags]),
        tagQuery
      ),
    [knownTags, tags, tagQuery]
  )

  // Selects the new category only once it is saved, so the edit can't
  // reference a category the server doesn't have.
  async function handleAddCategory() {
    const label = categoryQuery.trim()
    if (!label) return
    const created = await onCreateCategory(label)
    if (!created) return
    setCategory(created.id)
    setCategoryQuery('')
  }

  function handleAddTag(tag: string) {
    const value = tag.trim()
    if (!value || tags.includes(value)) return
    setTags((current) => [...current, value])
  }

  function handleRemoveTag(tag: string) {
    setTags((current) => current.filter((value) => value !== tag))
  }

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

  function householdWrite(): HouseholdWrite {
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

  function handleSave() {
    const trimmed = description.trim()
    if (!trimmed) {
      setError('La descripción no puede quedar vacía')
      return
    }
    setError('')
    onSave({
      description: trimmed,
      category: category.trim() || null,
      tags,
      applyScope,
      household: householdWrite(),
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar transacción</DialogTitle>
        <DialogDescription>
          {`${formatDate(transaction.date)} · ${
            transaction.type === 'credit' ? '+' : '-'
          }${formatCurrency(
            transaction.amount,
            transaction.currency as Currency
          )} · ${getAccountLabel(transaction.source, transaction.currency)}`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Descripción visible</label>
          <Input
            aria-label="Descripción edición"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Original: {transaction.description}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Categoría</label>
          <Popover
            open={categoryPickerOpen}
            onOpenChange={setCategoryPickerOpen}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Categoría dropdown"
                className="mt-1 w-full min-h-9 rounded-md border border-input bg-input-background px-2 py-1 text-left hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <CategoryBadge
                    categoryId={category || Category.Uncategorized}
                    size="sm"
                  />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[320px]" align="start">
              <div className="p-2 space-y-2">
                <Input
                  aria-label="Nueva categoría"
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  placeholder="Buscar o crear categoría"
                />
                <div
                  className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2 [-webkit-overflow-scrolling:touch]"
                  onWheel={(event) => event.stopPropagation()}
                  onTouchMove={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => {
                      setCategory('')
                      setCategoryPickerOpen(false)
                    }}
                  >
                    <CategoryBadge
                      categoryId={Category.Uncategorized}
                      size="sm"
                    />
                  </button>
                  {categorySuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        setCategory(suggestion)
                        setCategoryPickerOpen(false)
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <CategoryBadge categoryId={suggestion} size="sm" />
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Crear categoría"
                  className="w-full"
                  onClick={() => {
                    void handleAddCategory()
                    setCategoryPickerOpen(false)
                  }}
                >
                  Crear categoría
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <RadioGroup
          legend="Aplicar nombre y categoría a"
          name="apply-scope"
          value={applyScope}
          onChange={setApplyScope}
          options={[
            { value: 'single', label: 'Solo esta transacción' },
            {
              value: 'matching_past_and_future',
              label:
                similarCount > 1
                  ? `Todas las similares · se aplica a ${similarCount} transacciones (y a las futuras)`
                  : 'Todas las similares · solo esta por ahora (y las futuras)',
            },
            {
              value: 'future_matching_only',
              label: 'Esta y las que importes en el futuro',
              hint:
                similarCount > 1
                  ? 'La categoría cambia solo en esta. El nombre visible se comparte con todas las similares.'
                  : undefined,
            },
          ]}
        />

        {showHousehold && (
          <RadioGroup
            legend={
              <>
                Gasto del hogar
                {!canMakeRule && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · solo esta transacción
                  </span>
                )}
              </>
            }
            name="household"
            value={shownChoice}
            onChange={pickHousehold}
            onReselect={pickHousehold}
            options={[
              ...(remembered
                ? []
                : [{ value: 'category' as const, label: followLabel }]),
              { value: 'yes', label: 'Sí' },
              { value: 'no', label: 'No' },
            ]}
          />
        )}

        {canMakeRule && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="household-remember"
              className="mt-0.5"
              checked={remember}
              onCheckedChange={(checked) => toggleRemember(checked === true)}
              aria-describedby="household-remember-hint"
            />
            <div className="min-w-0">
              <label
                htmlFor="household-remember"
                className="cursor-pointer text-sm [overflow-wrap:anywhere]"
              >
                {`Recordar para todas las de ${getDisplayDescription(transaction)}`}
              </label>
              <p
                id="household-remember-hint"
                className="text-xs text-muted-foreground"
              >
                {startedRemembered && !remember
                  ? 'Al guardar, se deja de recordar'
                  : householdSimilarCount > 1
                    ? `Se aplica a ${householdSimilarCount} transacciones y a las que importes`
                    : 'Por ahora solo esta, y las que importes'}
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">
            Etiquetas{' '}
            <span className="font-normal text-muted-foreground">
              · solo en esta transacción
            </span>
          </label>
          <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Etiquetas dropdown"
                className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
              >
                {tags.length > 0
                  ? `${tags.length} ${tags.length === 1 ? 'etiqueta seleccionada' : 'etiquetas seleccionadas'}`
                  : 'Sin etiquetas'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[320px]" align="start">
              <div className="p-2 space-y-2">
                <Input
                  aria-label="Nueva etiqueta"
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  placeholder="Buscar o crear etiqueta"
                />
                <div
                  className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2 [-webkit-overflow-scrolling:touch]"
                  onWheel={(event) => event.stopPropagation()}
                  onTouchMove={(event) => event.stopPropagation()}
                >
                  {tagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        handleAddTag(tag)
                        setTagPickerOpen(false)
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Crear etiqueta"
                  className="w-full"
                  onClick={() => {
                    handleAddTag(tagQuery)
                    setTagQuery('')
                    setTagPickerOpen(false)
                  }}
                >
                  Crear etiqueta
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-label={`Quitar etiqueta ${tag}`}
                  onClick={() => handleRemoveTag(tag)}
                  className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                >
                  #{tag} ×
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancelar
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
          Guardar cambios
        </Button>
      </DialogFooter>
    </>
  )
}
