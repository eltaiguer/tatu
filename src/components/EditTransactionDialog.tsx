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

export type ApplyScope =
  | 'single'
  | 'matching_past_and_future'
  | 'future_matching_only'

// What the user saved. `description` is trimmed and never empty;
// `category` is undefined for "sin categoría".
export interface EditTransactionDraft {
  description: string
  category?: string
  tags: string[]
  applyScope: ApplyScope
}

interface EditTransactionDialogProps {
  // The row being edited; null closes the dialog. Each transaction starts a
  // fresh draft.
  transaction: Transaction | null
  // Rows an apply-to-similar edit would visibly change
  // (countSimilarEditReach), given whether the draft renames the row.
  countSimilar: (renamed: boolean) => number
  // Tags already in use, offered as suggestions.
  knownTags: string[]
  isSaving: boolean
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
  return (
    <Dialog
      open={transaction !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        {transaction ? (
          <EditTransactionForm
            key={transaction.id}
            transaction={transaction}
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
  knownTags,
  isSaving,
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
    () => countSimilar(renamed),
    [countSimilar, renamed]
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

  function handleSave() {
    const trimmed = description.trim()
    if (!trimmed) {
      setError('La descripción no puede quedar vacía')
      return
    }
    setError('')
    onSave({
      description: trimmed,
      category: category.trim() || undefined,
      tags,
      applyScope,
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
