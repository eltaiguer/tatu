import { useRef, useState } from 'react'
import { Loader2, Pencil, Slash, Sparkles, Tag, Trash2 } from 'lucide-react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { getCategoryDisplay } from '../../utils/category-display'

/* ---- BulkBar ---- */
export function BulkBar({
  count,
  total,
  onSelectAll,
  onClear,
  onCategorize,
  onEdit,
  onAuto,
  onIgnore,
  onDelete,
  isAutoCategorizing,
  isBusy,
  categorySuggestions,
}: {
  count: number
  total: number
  onSelectAll: () => void
  onClear: () => void
  onCategorize: (category: string) => void
  onEdit: () => void
  onAuto: () => void
  onIgnore: () => void
  onDelete: () => void
  isAutoCategorizing: boolean
  isBusy: boolean
  categorySuggestions: string[]
}) {
  const [catOpen, setCatOpen] = useState(false)
  const catRef = useRef<HTMLDivElement>(null)
  useClickOutside(catRef, () => setCatOpen(false))

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
          ref={catRef}
        >
          {/* Quick categorize */}
          <button
            onClick={() => setCatOpen((o) => !o)}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            <Tag size={13} />
            Categorizar
          </button>

          {catOpen && (
            <div className="absolute bottom-[calc(100%+10px)] left-0 z-[80] max-h-[280px] w-[220px] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-[6px] shadow-[var(--shadow-lg)]">
              {categorySuggestions.map((cat) => {
                const { label, color } = getCategoryDisplay(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      onCategorize(cat)
                      setCatOpen(false)
                    }}
                    className="flex w-full cursor-pointer items-center gap-[9px] rounded-[7px] border-none bg-transparent px-[9px] py-[7px] [font:inherit] text-[13px]! text-[var(--text)]"
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        'var(--muted)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        'transparent')
                    }
                  >
                    <span
                      className="h-[8px] w-[8px] shrink-0 rounded-[3px]"
                      style={{ background: color }}
                    />
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Full edit dialog */}
          <button
            onClick={onEdit}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
            aria-label="Editar seleccionadas"
          >
            <Pencil size={13} />
            Editar
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
            onClick={onIgnore}
            disabled={isBusy}
            className="inline-flex h-[32px] cursor-pointer items-center gap-[5px] rounded-[8px] border border-[var(--border)] bg-transparent px-[10px] py-0 [font:inherit] text-[13px]! whitespace-nowrap"
          >
            <Slash size={13} />
            Ignorar
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
