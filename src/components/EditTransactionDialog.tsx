import { Loader2 } from 'lucide-react'
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
import type { Transaction } from '../models'

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
  pendingTransactionId: string | null

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
  pendingTransactionId,
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
    Boolean(editingTransaction) &&
    pendingTransactionId === editingTransaction?.id

  return (
    <Dialog
      open={editingTransaction !== null}
      onOpenChange={(open) => !open && onCancel()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar transacción</DialogTitle>
          <DialogDescription>
            Actualizá descripción visible, categoría y tags.
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
            <label className="text-sm font-medium">
              Aplicar cambios de descripción/categoría
            </label>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="apply-scope"
                  value="single"
                  checked={applyScope === 'single'}
                  onChange={() => onApplyScopeChange('single')}
                />
                Solo esta transacción
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="apply-scope"
                  value="matching_past_and_future"
                  aria-label="Aplicar a todas las transacciones similares"
                  checked={applyScope === 'matching_past_and_future'}
                  onChange={() =>
                    onApplyScopeChange('matching_past_and_future')
                  }
                />
                Todas las similares (pasadas y futuras)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="apply-scope"
                  value="future_matching_only"
                  aria-label="Aplicar a transacciones futuras similares"
                  checked={applyScope === 'future_matching_only'}
                  onChange={() => onApplyScopeChange('future_matching_only')}
                />
                Esta y futuras similares
              </label>
            </div>
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
                    className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                    style={{ WebkitOverflowScrolling: 'touch' }}
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

          <div>
            <label className="text-sm font-medium">Tags</label>
            <Popover open={tagPickerOpen} onOpenChange={onTagPickerOpenChange}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Tags dropdown"
                  className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
                >
                  {editTagList.length > 0
                    ? `${editTagList.length} tags seleccionados`
                    : 'Sin tags'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[320px]" align="start">
                <div className="p-2 space-y-2">
                  <Input
                    aria-label="Nuevo tag"
                    value={newTagInput}
                    onChange={(event) =>
                      onNewTagInputChange(event.target.value)
                    }
                    placeholder="Buscar o crear tag"
                  />
                  <div
                    className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                    style={{ WebkitOverflowScrolling: 'touch' }}
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
                    aria-label="Crear tag"
                    className="w-full"
                    onClick={() => {
                      onAddInlineTag()
                      onTagPickerOpenChange(false)
                    }}
                  >
                    Crear tag
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
                    aria-label={`Quitar tag ${tag}`}
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
            {isPending && (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            )}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
