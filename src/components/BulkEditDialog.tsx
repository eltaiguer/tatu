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

interface BulkEditDialogProps {
  open: boolean
  selectionCount: number
  bulkEditCategory: string
  bulkEditTagList: string[]
  bulkCategoryPickerOpen: boolean
  bulkTagPickerOpen: boolean
  bulkCategorySearch: string
  bulkTagSearch: string
  bulkFilteredCategories: string[]
  bulkFilteredTags: string[]
  tagSuggestions: string[]
  isBulkOperating: boolean
  showCategorySection: boolean
  showTagSection: boolean

  onBulkEditCategoryChange: (value: string) => void
  onBulkEditTagListChange: (tags: string[]) => void
  onBulkCategoryPickerOpenChange: (open: boolean) => void
  onBulkTagPickerOpenChange: (open: boolean) => void
  onBulkCategorySearchChange: (value: string) => void
  onBulkTagSearchChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function BulkEditDialog({
  open,
  selectionCount,
  bulkEditCategory,
  bulkEditTagList,
  bulkCategoryPickerOpen,
  bulkTagPickerOpen,
  bulkCategorySearch,
  bulkTagSearch,
  bulkFilteredCategories,
  bulkFilteredTags,
  tagSuggestions,
  isBulkOperating,
  showCategorySection,
  showTagSection,
  onBulkEditCategoryChange,
  onBulkEditTagListChange,
  onBulkCategoryPickerOpenChange,
  onBulkTagPickerOpenChange,
  onBulkCategorySearchChange,
  onBulkTagSearchChange,
  onSave,
  onCancel,
}: BulkEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Editar {selectionCount} transacción
            {selectionCount === 1 ? '' : 'es'}
          </DialogTitle>
          <DialogDescription>
            Cambiá categoría y tags de las transacciones seleccionadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {showCategorySection && (
            <div>
              <label className="text-sm font-medium">Categoría</label>
              <Popover
                open={bulkCategoryPickerOpen}
                onOpenChange={onBulkCategoryPickerOpenChange}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Categoría bulk dropdown"
                    className="mt-1 w-full min-h-9 rounded-md border border-input bg-input-background px-2 py-1 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {bulkEditCategory ? (
                        <CategoryBadge
                          categoryId={bulkEditCategory}
                          size="sm"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Sin cambios
                        </span>
                      )}
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                  <div className="p-2 space-y-2">
                    <Input
                      aria-label="Buscar categoría"
                      value={bulkCategorySearch}
                      onChange={(event) =>
                        onBulkCategorySearchChange(event.target.value)
                      }
                      placeholder="Buscar categoría..."
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
                          onBulkEditCategoryChange('')
                          onBulkCategoryPickerOpenChange(false)
                        }}
                      >
                        <span className="text-muted-foreground">
                          Sin cambios
                        </span>
                      </button>
                      {bulkFilteredCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            onBulkEditCategoryChange(category)
                            onBulkCategoryPickerOpenChange(false)
                          }}
                        >
                          <CategoryBadge categoryId={category} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {showTagSection && (
            <div>
              <label className="text-sm font-medium">Etiquetas</label>
              <Popover
                open={bulkTagPickerOpen}
                onOpenChange={onBulkTagPickerOpenChange}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Etiquetas bulk dropdown"
                    className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
                  >
                    {bulkEditTagList.length > 0
                      ? `${bulkEditTagList.length} ${bulkEditTagList.length === 1 ? 'etiqueta' : 'etiquetas'} a agregar`
                      : 'Sin cambios'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                  <div className="p-2 space-y-2">
                    <Input
                      aria-label="Buscar o crear etiqueta"
                      value={bulkTagSearch}
                      onChange={(event) =>
                        onBulkTagSearchChange(event.target.value)
                      }
                      placeholder="Buscar o crear etiqueta..."
                    />
                    <div
                      className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheel={(event) => event.stopPropagation()}
                      onTouchMove={(event) => event.stopPropagation()}
                    >
                      {bulkFilteredTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${bulkEditTagList.includes(tag) ? 'bg-accent' : ''}`}
                          onClick={() => {
                            onBulkEditTagListChange(
                              bulkEditTagList.includes(tag)
                                ? bulkEditTagList.filter((t) => t !== tag)
                                : [...bulkEditTagList, tag]
                            )
                          }}
                        >
                          #{tag}
                          {bulkEditTagList.includes(tag) && ' ✓'}
                        </button>
                      ))}
                    </div>
                    {bulkTagSearch.trim() &&
                      !tagSuggestions.includes(bulkTagSearch.trim()) && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            const newTag = bulkTagSearch.trim()
                            onBulkEditTagListChange(
                              bulkEditTagList.includes(newTag)
                                ? bulkEditTagList
                                : [...bulkEditTagList, newTag]
                            )
                            onBulkTagSearchChange('')
                          }}
                        >
                          Crear etiqueta &quot;{bulkTagSearch.trim()}&quot;
                        </Button>
                      )}
                  </div>
                </PopoverContent>
              </Popover>

              {bulkEditTagList.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {bulkEditTagList.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      aria-label={`Quitar etiqueta ${tag}`}
                      onClick={() =>
                        onBulkEditTagListChange(
                          bulkEditTagList.filter((t) => t !== tag)
                        )
                      }
                      className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isBulkOperating}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={
              isBulkOperating ||
              (!bulkEditCategory && bulkEditTagList.length === 0)
            }
          >
            {isBulkOperating && (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            )}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
