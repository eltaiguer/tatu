import type { Dispatch, SetStateAction } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Checkbox } from '../ui/checkbox'

export interface CategoryFormState {
  id: string
  label: string
  color: string
  icon: string
  isIgnored: boolean
}

interface CategoryFormProps {
  form: CategoryFormState
  setForm: Dispatch<SetStateAction<CategoryFormState>>
  isEditing: boolean
  onCancel: () => void
  onSave: () => void
}

// New / edit category form. The view owns the form state; this only renders
// it.
export function CategoryForm({
  form,
  setForm,
  isEditing,
  onCancel,
  onSave,
}: CategoryFormProps) {
  return (
    <div className="mb-[24px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-[24px] py-[20px]">
      <div className="mb-[16px] flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">
          {isEditing ? 'Editar categoría' : 'Nueva categoría'}
        </h3>
        <button
          onClick={onCancel}
          className="grid cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--text-faint)]"
          aria-label="Cancelar"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px] gap-3 mb-4">
        <div>
          <label
            htmlFor="cat-label"
            className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
          >
            Nombre
          </label>
          <Input
            id="cat-label"
            aria-label="Nombre de categoría"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Ej. Café"
          />
        </div>
        <div>
          <label
            htmlFor="cat-color"
            className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
          >
            Color
          </label>
          <Input
            id="cat-color"
            aria-label="Color de categoría"
            type="color"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            className="h-10"
          />
        </div>
        <div>
          <label
            htmlFor="cat-icon"
            className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
          >
            Icono
          </label>
          <Input
            id="cat-icon"
            aria-label="Icono de categoría"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            placeholder="🏷️"
            maxLength={2}
          />
        </div>
      </div>

      <div className="mt-[4px] flex items-center justify-between">
        <label
          htmlFor="cat-ignored"
          className="flex cursor-pointer items-center gap-[8px] select-none"
        >
          <Checkbox
            id="cat-ignored"
            checked={form.isIgnored}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, isIgnored: checked === true }))
            }
          />
          <div>
            <span className="text-[13px] font-medium">Ignorar en totales</span>
            <span className="ml-[6px] text-[12px] text-[var(--text-faint)]">
              Las transacciones de esta categoría no suman en gastos ni ingresos
            </span>
          </div>
        </label>
        <Button
          onClick={onSave}
          disabled={!form.label.trim()}
          aria-label={isEditing ? 'Guardar cambios' : 'Guardar categoría'}
        >
          {isEditing ? 'Guardar cambios' : 'Guardar categoría'}
        </Button>
      </div>
    </div>
  )
}
