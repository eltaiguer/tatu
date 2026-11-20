import { useRef, useState } from 'react'
import {
  EyeOff,
  House,
  Loader2,
  Shapes,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { CategoryPicker } from '../CategoryPicker'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { householdValueLabel } from '../../services/household/household-copy'

/* ---- BulkBar ---- */
export function BulkBar({
  count,
  total,
  onSelectAll,
  onClear,
  onCategorize,
  onHousehold,
  onTags,
  onAuto,
  onIgnore,
  onDelete,
  isAutoCategorizing,
  isBusy,
  categorizeOpen,
  onCategorizeOpenChange,
}: {
  count: number
  total: number
  onSelectAll: () => void
  onClear: () => void
  onCategorize: (category: string) => void
  // Absent when the view cannot save the household choice.
  onHousehold?: (household: boolean | null) => void
  onTags: () => void
  onAuto: () => void
  onIgnore: () => void
  onDelete: () => void
  isAutoCategorizing: boolean
  isBusy: boolean
  categorizeOpen: boolean
  onCategorizeOpenChange: (open: boolean) => void
}) {
  // A phone: the keyboard would cover the list, so the first option takes
  // focus instead of the search (as the row's sheet does).
  const coarse =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(pointer: coarse)').matches
  const [houseOpen, setHouseOpen] = useState(false)
  const houseRef = useRef<HTMLDivElement>(null)
  const houseTriggerRef = useRef<HTMLButtonElement>(null)
  useClickOutside(houseRef, () => setHouseOpen(false))

  return (
    <div
      role="region"
      aria-label="Acciones de selección"
      // Below md the bar spans the screen and wraps: count, "select all" and
      // × on the first row, the actions on the rows under it (#194). z-40
      // keeps it under dialog overlays (z-50).
      className="fixed inset-x-4 bottom-4 z-40 [animation:fadeUp_0.2s_both] md:inset-x-auto md:bottom-[26px] md:left-[calc(50%+var(--sidebar-w,252px)/2)] md:[transform:translateX(-50%)]"
    >
      <div className="flex items-center gap-[10px] rounded-[999px] border border-[var(--border)] bg-[var(--surface)] py-[10px] pr-[12px] pl-[16px] shadow-[var(--shadow-lg)] max-md:flex-wrap max-md:rounded-[16px]">
        <span
          role="status"
          aria-live="polite"
          className="text-[14px] font-semibold whitespace-nowrap"
        >
          {count} seleccionada{count !== 1 ? 's' : ''}
        </span>

        {count < total && (
          <button
            onClick={onSelectAll}
            disabled={isBusy}
            className="cursor-pointer border-none bg-transparent bg-none p-0 text-[13px] whitespace-nowrap text-[var(--brand)]"
          >
            Seleccionar las {total} transacciones
          </button>
        )}

        <span className="h-[22px] w-[1px] bg-[var(--border)] max-md:hidden" />

        <div
          role="group"
          aria-label="Acciones"
          className="relative flex gap-[4px] max-md:order-last max-md:w-full max-md:flex-wrap"
        >
          {/* Categorizar: the shared picker, in a popover */}
          <Popover
            open={categorizeOpen}
            onOpenChange={(next) => {
              if (next) setHouseOpen(false)
              onCategorizeOpenChange(next)
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isBusy}
                className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
              >
                <Shapes size={13} aria-hidden="true" />
                Categorizar
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              collisionPadding={16}
              className="w-[min(280px,calc(100vw-2rem))] p-0"
              aria-label="Elegir categoría"
              onOpenAutoFocus={(event) => {
                if (!coarse) return
                event.preventDefault()
                ;(event.currentTarget as HTMLElement)
                  .querySelector<HTMLElement>('[data-category-option]')
                  ?.focus()
              }}
            >
              <CategoryPicker
                touch={coarse}
                onPick={(id) => {
                  onCategorizeOpenChange(false)
                  onCategorize(id)
                }}
              />
            </PopoverContent>
          </Popover>

          {/* Hogar: a yes / no / back-to-category for the selection */}
          {onHousehold && (
            <div
              ref={houseRef}
              className="relative"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && houseOpen) {
                  e.stopPropagation()
                  setHouseOpen(false)
                  houseTriggerRef.current?.focus()
                }
              }}
            >
              <button
                ref={houseTriggerRef}
                type="button"
                aria-expanded={houseOpen}
                onClick={() => {
                  onCategorizeOpenChange(false)
                  setHouseOpen((o) => !o)
                }}
                disabled={isBusy}
                className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
              >
                <House size={13} aria-hidden="true" />
                Hogar
              </button>
              {houseOpen && (
                <div className="absolute bottom-[calc(100%+10px)] left-0 z-[80] w-[200px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-[6px] shadow-[var(--shadow-lg)]">
                  {(
                    [
                      [householdValueLabel(true), true],
                      [householdValueLabel(false), false],
                      ['Según categoría', null],
                    ] as const
                  ).map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        onHousehold(value)
                        setHouseOpen(false)
                      }}
                      className="flex w-full cursor-pointer items-center rounded-[7px] border-none bg-transparent px-[9px] py-[7px] [font:inherit] text-[13px]! text-[var(--text)] hover:bg-[var(--muted)]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onIgnore}
            disabled={isBusy}
            title="Dejar fuera de los totales"
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            <EyeOff size={13} aria-hidden="true" />
            No contar
          </button>

          <button
            onClick={onTags}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            <Tag size={13} />
            Etiquetas
          </button>

          <button
            onClick={onAuto}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            {isAutoCategorizing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {isAutoCategorizing ? 'Auto-categorizando...' : 'Auto-categorizar'}
          </button>

          <button
            onClick={onDelete}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap text-[var(--neg)]"
          >
            <Trash2 size={13} />
            Eliminar
          </button>
        </div>

        <span className="h-[22px] w-[1px] bg-[var(--border)] max-md:hidden" />

        <button
          onClick={onClear}
          title="Deseleccionar"
          disabled={isBusy}
          className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[999px] border-none bg-transparent text-[var(--text-muted)] max-md:ml-auto"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
