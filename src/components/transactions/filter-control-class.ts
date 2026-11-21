import { cn } from '../ui/utils'

// A button-shaped filter control (Hogar chip, Filtros, Categoría): brand
// border and text while its filter is on.
export function filterControlClass(active: boolean, extra?: string): string {
  return cn(
    'bg-input-background focus-visible:ring-ring/50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-[3px]',
    active
      ? 'border-[var(--brand)] text-[var(--brand-text,var(--brand))]'
      : 'border-input focus-visible:border-ring',
    extra
  )
}
