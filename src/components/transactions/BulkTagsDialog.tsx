import { useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { focusFirstOption, handleOptionListKeyDown } from '../ui/option-list'
import { filterTagSuggestions } from '../../services/suggestions/suggestions'

interface BulkTagsDialogProps {
  open: boolean
  selectionCount: number
  tagSuggestions: string[]
  isBulkOperating: boolean
  onSave: (tags: string[]) => void
  onCancel: () => void
}

/**
 * "Etiquetas" of the selection bar (#282): adds tags to the selected rows. The
 * draft lives in the form inside the content, which unmounts on close, so
 * every opening starts empty.
 */
export function BulkTagsDialog({
  open,
  selectionCount,
  tagSuggestions,
  isBulkOperating,
  onSave,
  onCancel,
}: BulkTagsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Etiquetas para {selectionCount}{' '}
            {selectionCount === 1 ? 'transacción' : 'transacciones'}
          </DialogTitle>
          <DialogDescription>
            Se agregan a las seleccionadas; las que ya la tienen no cambian.
          </DialogDescription>
        </DialogHeader>
        <BulkTagsForm
          tagSuggestions={tagSuggestions}
          isBulkOperating={isBulkOperating}
          onSave={onSave}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  )
}

function BulkTagsForm({
  tagSuggestions,
  isBulkOperating,
  onSave,
  onCancel,
}: Pick<
  BulkTagsDialogProps,
  'tagSuggestions' | 'isBulkOperating' | 'onSave' | 'onCancel'
>) {
  const [tagList, setTagList] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const filteredTags = filterTagSuggestions(tagSuggestions, tagSearch)
  // The picker is named by its visible label plus its current value.
  const id = useId()
  const tagLabelId = `${id}-tag-label`
  const tagTriggerId = `${id}-tag-trigger`
  const tagListRef = useRef<HTMLDivElement>(null)

  function addTag(raw: string) {
    const typed = raw.trim()
    if (!typed) return
    // A tag that already exists (in any case) is reused, so a differently
    // cased query never adds a near-duplicate to every selected row.
    const key = typed.toLocaleLowerCase('es')
    const sameTag = (t: string) => t.toLocaleLowerCase('es') === key
    const tag = tagList.find(sameTag) ?? tagSuggestions.find(sameTag) ?? typed
    if (!tagList.includes(tag)) setTagList([...tagList, tag])
    setTagSearch('')
  }

  return (
    <>
      <div>
        <label id={tagLabelId} className="text-sm font-medium">
          Etiquetas
        </label>
        <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              id={tagTriggerId}
              aria-labelledby={`${tagLabelId} ${tagTriggerId}`}
              className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
            >
              {tagList.length > 0
                ? `${tagList.length} ${tagList.length === 1 ? 'etiqueta' : 'etiquetas'} a agregar`
                : 'Sin cambios'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="start">
            <div className="p-2 space-y-2">
              <Input
                aria-label="Buscar o crear etiqueta"
                value={tagSearch}
                onChange={(event) => setTagSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTag(tagSearch)
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    focusFirstOption(tagListRef.current)
                  }
                }}
                placeholder="Buscar o crear etiqueta..."
              />
              <div
                ref={tagListRef}
                className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2 [-webkit-overflow-scrolling:touch]"
                onWheel={(event) => event.stopPropagation()}
                onTouchMove={(event) => event.stopPropagation()}
                onKeyDown={handleOptionListKeyDown}
              >
                {filteredTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${tagList.includes(tag) ? 'bg-accent' : ''}`}
                    onClick={() =>
                      setTagList(
                        tagList.includes(tag)
                          ? tagList.filter((t) => t !== tag)
                          : [...tagList, tag]
                      )
                    }
                  >
                    #{tag}
                    {tagList.includes(tag) && ' ✓'}
                  </button>
                ))}
              </div>
              {tagSearch.trim() &&
                !tagSuggestions.includes(tagSearch.trim()) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => addTag(tagSearch)}
                  >
                    Crear etiqueta &quot;{tagSearch.trim()}&quot;
                  </Button>
                )}
            </div>
          </PopoverContent>
        </Popover>

        {tagList.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tagList.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-label={`Quitar etiqueta ${tag}`}
                onClick={() => setTagList(tagList.filter((t) => t !== tag))}
                className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
              >
                #{tag} ×
              </button>
            ))}
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
          onClick={() => onSave(tagList)}
          disabled={isBulkOperating || tagList.length === 0}
        >
          {isBulkOperating && (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          )}
          Agregar etiquetas
        </Button>
      </DialogFooter>
    </>
  )
}
