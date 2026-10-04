import type { View } from './AppSidebar'
import { Card } from './ui/card'
import { Skeleton } from './ui/skeleton'

/**
 * Loading skeletons shaped like the real screens. Built on the existing
 * shadcn <Skeleton> (bg-accent animate-pulse). Render while the initial
 * Supabase sync is in flight (useUserWorkspace status is 'loading'), or
 * while a view's lazy chunk loads. Use <ViewSkeleton>: it picks the shape
 * for the view and announces the wait to screen readers (#203).
 */

function AccountCardSkeleton() {
  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-[10px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-2/5" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-6 w-3/5" />
      </div>
      <div className="flex justify-between border-t border-border pt-3">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-14" />
      </div>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-3 w-72" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AccountCardSkeleton />
        <AccountCardSkeleton />
        <AccountCardSkeleton />
      </div>

      <Card className="p-5 space-y-5">
        <Skeleton className="h-4 w-60" />
        <div className="grid grid-cols-1 gap-7 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-6 w-3/5" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-2.5 w-2/5" />
                <Skeleton className="h-2.5 w-14" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </Card>
        <Card className="p-5 space-y-4">
          <Skeleton className="h-4 w-44" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-[9px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

export function TransactionTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2.5">
          <Skeleton className="h-9 flex-1 min-w-[240px] rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-44 rounded-md" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3 hidden md:flex gap-4">
          {['w-4', 'w-16', 'w-40', 'w-24', 'w-16', 'w-10', 'w-16'].map(
            (w, i) => (
              <Skeleton key={i} className={`h-3 ${w}`} />
            )
          )}
        </div>
        {/* Desktop: table rows (spaced like the Card's own children were) */}
        <div className="hidden md:flex md:flex-col md:gap-6">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
            >
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-14" />
              <div className="flex flex-1 items-center gap-2.5">
                <Skeleton className="h-[30px] w-[30px] rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        {/* Mobile: the card list TransactionTable shows below md */}
        <div className="divide-y divide-border md:hidden">
          <div className="flex items-center gap-3 bg-muted/30 p-4">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-2.5 w-14" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      {action && <Skeleton className="h-9 w-36 rounded-md" />}
    </div>
  )
}

// Configuración and Insights: a page header over stacked section cards of
// label/description rows.
function SectionsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {[3, 2, 2].map((rowCount, card) => (
        <Card key={card} className="space-y-5 p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-2.5 w-3/5" />
              </div>
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}

// Categorías: header with "Nueva categoría", then the category card grid.
function CategoriesSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton action />
      <Card className="space-y-4 p-5">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <Skeleton className="h-8 w-8 rounded-[9px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const SHAPES: Record<View, () => JSX.Element> = {
  overview: DashboardSkeleton,
  transactions: () => <TransactionTableSkeleton />,
  insights: SectionsSkeleton,
  categories: CategoriesSkeleton,
  settings: SectionsSkeleton,
}

/**
 * The loading state for a view, shaped like that view and announced as a
 * busy status. The wrapper is a plain block so the shape's own layout is
 * untouched.
 */
export function ViewSkeleton({ view }: { view: View }) {
  const Shape = SHAPES[view]
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <Shape />
    </div>
  )
}
