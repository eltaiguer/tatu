import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { RadioGroup } from './ui/radio-group'
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
import { Category, isSplitChildTx, isSplitParentTx } from '../models'
import { normalizeCategoryId } from '../services/categories/category-aliases'
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
import { HouseholdField } from './transactions/HouseholdField'
import {
  useHouseholdDraft,
  type HouseholdWrite,
} from './transactions/useHouseholdDraft'

export type { HouseholdWrite }

export type ApplyScope =
  | 'single'
  | 'matching_past_and_future'
  | 'future_matching_only'

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
  // Whether a change to `category` opens on "Todas las similares" (#281; the
  // conservative rule in services/descriptions/default-scope.ts).
  defaultToAll: (transaction: Transaction, category: string) => boolean
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
  defaultToAll,
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
  // null until the user touches the radio: then the default follows the form.
  const [chosenScope, setChosenScope] = useState<ApplyScope | null>(null)
  const household = useHouseholdDraft({
    transaction,
    category,
    canSetHousehold,
    canSetHouseholdRule,
    countHouseholdSimilar,
  })
  const [error, setError] = useState('')
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')

  // "Renamed" exactly as the save decides it, so the number shown is the
  // number of rows the save will touch.
  const [openedName] = useState(() => getDisplayDescription(transaction))
  const name = description.trim()
  // An untouched name is not a rename, even when the row has its own.
  const renamed =
    !!name && name !== transaction.description && name !== openedName
  const similarCount = useMemo(
    () => countSimilar(transaction, renamed),
    [countSimilar, transaction, renamed]
  )

  // A changed category favours the whole merchant (#281). Derived, not
  // initial state: the save always sends the row's category, and a matching
  // scope would stamp it on every similar row, so a rename-, tags- or
  // Hogar-only save must stay on this row. Sin categoría would delete the
  // merchant override; split rows have their category per part.
  const categoryChanged =
    category !== '' &&
    normalizeCategoryId(category) !== normalizeCategoryId(transaction.category)
  const applyScope: ApplyScope =
    chosenScope ??
    (categoryChanged &&
    !isSplitChildTx(transaction) &&
    !isSplitParentTx(transaction) &&
    defaultToAll(transaction, category)
      ? 'matching_past_and_future'
      : 'single')

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
      household: household.toWrite(),
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
          onChange={setChosenScope}
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

        <HouseholdField draft={household} />

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
