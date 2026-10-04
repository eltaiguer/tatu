import { forwardRef, type ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from './utils'

// A native <select> styled like the app's inputs. Native keeps keyboard,
// mobile pickers and screen readers working; only the look changes.
export const NativeSelect = forwardRef<
  HTMLSelectElement,
  ComponentProps<'select'>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'h-10 w-full appearance-none rounded-[var(--radius-sm)] border border-border bg-[var(--surface)] pr-8 pl-3 text-small text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      size={15}
      className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
    />
  </div>
))
NativeSelect.displayName = 'NativeSelect'
