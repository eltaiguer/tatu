import { Card } from './ui/card'
import { Skeleton } from './ui/skeleton'

/**
 * Loading skeletons shaped like the real screens. Built on the existing
 * shadcn <Skeleton> (bg-accent animate-pulse). Render while the initial
 * Supabase sync is in flight (see useTransactionSync status patch in README).
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

export function DashboardSkeleton() {
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
          {['w-4', 'w-16', 'w-40', 'w-24', 'w-16', 'w-10', 'w-16'].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
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
      </Card>
    </div>
  )
}

