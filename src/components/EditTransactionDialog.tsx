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
import { getAccountLabel } from './TransactionTable'

interface EditTransactionDialogProps {
  editingTransaction: Transaction | null
  editDescription: string
  editCategory: string
  editTagList: string[]
  applyScope: 'single' | 'matching_past_and_future' | 'future_matching_only'
  editError: string
  categoryPickerOpen: boolean
  tagPickerOpen: boolean
  newCategoryInput: string
  newTagInput: string
  filteredCategorySuggestions: string[]
  filteredTagSuggestions: string[]
  pendingTransactionIds: ReadonlySet<string>
  // Rows an apply-to-similar edit would visibly change
  // (countSimilarEditReach).
  similarCount: number

  onDescriptionChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onApplyScopeChange: (
    value: 'single' | 'matching_past_and_future' | 'future_matching_only'
  ) => void
  onCategoryPickerOpenChange: (open: boolean) => void
  onTagPickerOpenChange: (open: boolean) => void
  onNewCategoryInputChange: (value: string) => void
  onNewTagInputChange: (value: string) => void
  onAddCategory: () => void
  onAddTag: (tag: string) => void
  onAddInlineTag: () => void
  onRemoveTag: (tag: string) => void
  onSave: () => void
  onCancel: () => void
}

export function EditTransactionDialog({
  editingTransaction,
  editDescription,
  editCategory,
  editTagList,
  applyScope,
  editError,
  categoryPickerOpen,
  tagPickerOpen,
  newCategoryInput,
  newTagInput,
  filteredCategorySuggestions,
  filteredTagSuggestions,
  pendingTransactionIds,
  similarCount,
  onDescriptionChange,
  onCategoryChange,
  onApplyScopeChange,
  onCategoryPickerOpenChange,
  onTagPickerOpenChange,
  onNewCategoryInputChange,
  onNewTagInputChange,
  onAddCategory,
  onAddTag,
  onAddInlineTag,
  onRemoveTag,
  onSave,
  onCancel,
}: EditTransactionDialogProps) {
  const isPending =
    editingTransaction !== null &&
    pendingTransactionIds.has(editingTransaction.id)

  return (
    <Dialog
      open={editingTransaction !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar transacción</DialogTitle>
          <DialogDescription>
            {editingTransaction
              ? `${formatDate(editingTransaction.date)} · ${
                  editingTransaction.type === 'credit' ? '+' : '-'
                }${formatCurrency(
                  editingTransaction.amount,
                  editingTransaction.currency as Currency
                )} · ${getAccountLabel(
                  editingTransaction.source,
                  editingTransaction.currency
                )}`
              : 'Actualizá descripción visible, categoría y etiquetas.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Descripción visible</label>
            <Input
              aria-label="Descripción edición"
              value={editDescription}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
            {editingTransaction && (
              <p className="mt-1 text-xs text-muted-foreground">
                Original: {editingTransaction.description}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Categoría</label>
            <Popover
              open={categoryPickerOpen}
              onOpenChange={onCategoryPickerOpenChange}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Categoría dropdown"
                  className="mt-1 w-full min-h-9 rounded-md border border-input bg-input-background px-2 py-1 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <CategoryBadge
                      categoryId={editCategory || Category.Uncategorized}
                      size="sm"
                    />
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[320px]" align="start">
                <div className="p-2 space-y-2">
                  <Input
                    aria-label="Nueva categoría"
                    value={newCategoryInput}
                    onChange={(event) =>
                      onNewCategoryInputChange(event.target.value)
                    }
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
                        onCategoryChange('')
                        onCategoryPickerOpenChange(false)
                      }}
                    >
                      <CategoryBadge
                        categoryId={Category.Uncategorized}
                        size="sm"
                      />
                    </button>
                    {filteredCategorySuggestions.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => {
                          onCategoryChange(category)
                          onCategoryPickerOpenChange(false)
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <CategoryBadge categoryId={category} size="sm" />
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
                      onAddCategory()
                      onCategoryPickerOpenChange(false)
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
            onChange={onApplyScopeChange}
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
            <Popover open={tagPickerOpen} onOpenChange={onTagPickerOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Etiquetas dropdown"
                  className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
                >
                  {editTagList.length > 0
                    ? `${editTagList.length} ${editTagList.length === 1 ? 'etiqueta seleccionada' : 'etiquetas seleccionadas'}`
                    : 'Sin etiquetas'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[320px]" align="start">
                <div className="p-2 space-y-2">
                  <Input
                    aria-label="Nueva etiqueta"
                    value={newTagInput}
                    onChange={(event) =>
                      onNewTagInputChange(event.target.value)
                    }
                    placeholder="Buscar o crear etiqueta"
                  />
                  <div
                    className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2 [-webkit-overflow-scrolling:touch]"
                    onWheel={(event) => event.stopPropagation()}
                    onTouchMove={(event) => event.stopPropagation()}
                  >
                    {filteredTagSuggestions.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => {
                          onAddTag(tag)
                          onTagPickerOpenChange(false)
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
                      onAddInlineTag()
                      onTagPickerOpenChange(false)
                    }}
                  >
                    Crear etiqueta
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {editTagList.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {editTagList.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-label={`Quitar etiqueta ${tag}`}
                    onClick={() => onRemoveTag(tag)}
                    className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                  >
                    #{tag} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          {editError && (
            <p className="text-sm text-destructive" role="alert">
              {editError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={isPending}>
            {isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
