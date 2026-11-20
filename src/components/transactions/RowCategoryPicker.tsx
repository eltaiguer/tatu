import { CategoryBadge } from '../CategoryBadge'
import { CategoryPicker } from '../CategoryPicker'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import { Category } from '../../models'
import type { Transaction } from '../../models'
import { resolveCategory } from '../../services/categories/category-registry'

interface RowCategoryPickerProps {
  transaction: Transaction
  /** The row's display description, for the button's name. */
  description: string
  /** A popover under the badge (desktop row) or a bottom sheet (card). */
  variant: 'popover' | 'sheet'
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A write of this row is in flight. */
  pending: boolean
  onPick: (categoryId: string) => void
}

/**
 * The category badge of a row as a button that opens a category picker (#279).
 * The trigger is the badge, so Radix returns focus to it when the picker
 * closes. While a write is in flight it is `aria-disabled`, not `disabled`: a
 * disabled focused button would drop focus to the page.
 */
export function RowCategoryPicker({
  transaction,
  description,
  variant,
  open,
  onOpenChange,
  pending,
  onPick,
}: RowCategoryPickerProps) {
  const categoryId = transaction.category || Category.Uncategorized
  const label = resolveCategory(categoryId).label
  const trigger = (
    <button
      type="button"
      aria-label={`Categoría de ${description}: ${label}`}
      aria-keyshortcuts="c"
      aria-disabled={pending || undefined}
      title="Cambiar categoría (tecla C)"
      className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] aria-disabled:cursor-wait"
    >
      <CategoryBadge categoryId={categoryId} size="sm" />
    </button>
  )
  const change = (next: boolean) => {
    if (next && pending) return
    onOpenChange(next)
  }
  const pickAndClose = (id: string) => {
    onOpenChange(false)
    onPick(id)
  }

  if (variant === 'popover') {
    return (
      <Popover open={open} onOpenChange={change}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[280px] p-0"
          aria-label="Elegir categoría"
        >
          <CategoryPicker value={transaction.category} onPick={pickAndClose} />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[80vh] rounded-t-xl"
        // Focus the current option, not the search: the phone keyboard would
        // cover the list.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const root = event.currentTarget as HTMLElement
          ;(
            root.querySelector<HTMLElement>('[aria-current="true"]') ??
            root.querySelector<HTMLElement>('[data-category-option]')
          )?.focus()
        }}
      >
        <SheetHeader>
          <SheetTitle>Elegir categoría</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto">
          <CategoryPicker
            value={transaction.category}
            onPick={pickAndClose}
            touch
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
