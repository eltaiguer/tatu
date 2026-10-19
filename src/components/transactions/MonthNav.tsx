import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../ui/utils'
import { useClickOutside } from '../../hooks/useClickOutside'
import { toDateKey, todayAsUtcDate } from '../../utils/date-utils'
import type { UrlPeriod } from '../../services/filters/url-filters'
import { getPeriodLabel } from '../../services/filters/period-label'

const MONTHS_ES_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

/* ---- MonthNav ---- */
export function MonthNav({
  period,
  setPeriod,
  newest,
}: {
  period: UrlPeriod
  setPeriod: (p: UrlPeriod) => void
  newest: Date
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  const newestY = newest.getUTCFullYear()
  const newestM = newest.getUTCMonth()
  const today = todayAsUtcDate()
  const anchorY = period.mode === 'month' ? period.y : newestY
  const anchorM = period.mode === 'month' ? period.m : newestM
  const [gridYear, setGridYear] = useState(anchorY)

  useEffect(() => {
    if (open) {
      setGridYear(period.mode === 'month' ? period.y : newestY)
    }
  }, [open, period, newestY])

  function shift(dir: -1 | 1) {
    const base =
      period.mode === 'month'
        ? { y: period.y, m: period.m }
        : { y: anchorY, m: anchorM }
    const d = new Date(Date.UTC(base.y, base.m + dir, 1))
    setPeriod({ mode: 'month', y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  const isMonthMode = period.mode === 'month'
  const nextDisabled =
    isMonthMode && period.y === newestY && period.m >= newestM

  return (
    <div className="relative inline-flex" ref={ref}>
      <div className="inline-flex items-stretch overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <button
          onClick={() => shift(-1)}
          title="Mes anterior"
          className="grid w-[36px] cursor-pointer place-items-center border-none bg-transparent p-0 text-[var(--text-muted)]"
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'var(--muted)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <ChevronLeft size={17} />
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex min-w-[168px] cursor-pointer items-center justify-center gap-[9px] border-r border-l border-[var(--border)] px-[14px] py-0 text-[var(--text)] [font:inherit]',
            open ? 'bg-[var(--muted)]' : 'bg-transparent'
          )}
        >
          <Calendar size={14} className="text-[var(--text-muted)]" />
          <span className="text-[14px] font-semibold">
            {getPeriodLabel(period)}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[var(--text-muted)]"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => shift(1)}
          title="Mes siguiente"
          disabled={nextDisabled}
          className={cn(
            'grid w-[36px] place-items-center border-none bg-transparent p-0 text-[var(--text-muted)]',
            nextDisabled ? 'cursor-not-allowed opacity-[0.4]' : 'cursor-pointer'
          )}
          onMouseEnter={(e) => {
            if (!nextDisabled)
              (e.currentTarget as HTMLElement).style.background = 'var(--muted)'
          }}
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {open && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-[40] w-[300px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-[14px] shadow-[var(--shadow-lg)]">
          {/* Quick options */}
          <div className="mb-[12px] flex flex-wrap gap-[6px]">
            {[
              {
                // The shortcut jumps to the newest month with data; only call
                // it "este mes" when that is today's month (today = the local
                // calendar day, as a UTC calendar date).
                label:
                  newestY === today.getUTCFullYear() &&
                  newestM === today.getUTCMonth()
                    ? 'Este mes'
                    : 'Último mes',
                val: {
                  mode: 'month' as const,
                  y: newestY,
                  m: newestM,
                },
              },
              {
                label: 'Últimos 3 meses',
                val: { mode: 'recent' as const, n: 3 },
              },
              {
                label: 'Este año',
                val: {
                  mode: 'range' as const,
                  from: `${newestY}-01-01`,
                  to: toDateKey(newest),
                },
              },
              { label: 'Todo', val: { mode: 'all' as const } },
            ].map((q) => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  setPeriod(q.val)
                  setOpen(false)
                }}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <hr className="mx-[-14px] mt-0 mb-[12px] border-t border-[var(--border)]" />
          {/* Year nav */}
          <div className="mb-[10px] flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="h-[28px] w-[28px] p-0!"
              onClick={() => setGridYear((y) => y - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span className="font-[family-name:var(--font-mono)] text-[14px] font-semibold">
              {gridYear}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-[28px] w-[28px] p-0!"
              disabled={gridYear >= newestY}
              onClick={() => setGridYear((y) => y + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-[repeat(3,1fr)] gap-[6px]">
            {MONTHS_ES_SHORT.map((mo, i) => {
              const isFuture =
                gridYear > newestY || (gridYear === newestY && i > newestM)
              const isSel =
                period.mode === 'month' &&
                period.y === gridYear &&
                period.m === i
              return (
                <Button
                  key={i}
                  variant={isSel ? 'default' : 'outline'}
                  size="sm"
                  disabled={isFuture}
                  className="px-0 py-[7px] disabled:opacity-[0.35]"
                  onClick={() => {
                    setPeriod({ mode: 'month', y: gridYear, m: i })
                    setOpen(false)
                  }}
                >
                  {mo}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
