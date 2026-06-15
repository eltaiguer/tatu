import { useMemo, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Calendar } from './ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

interface DateRangePickerProps {
  dateFrom: string
  dateTo: string
  onChange: (from: string, to: string) => void
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length < 3) return dateStr
  return `${parts[2]}/${parts[1]}`
}

function getPresets() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateStr(today)

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const dayOfWeek = today.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - daysToMonday)

  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)

  const twoWeeksAgo = new Date(today)
  twoWeeksAgo.setDate(today.getDate() - 13)

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)

  const firstOfYear = new Date(today.getFullYear(), 0, 1)

  const firstOfLastYear = new Date(today.getFullYear() - 1, 0, 1)
  const lastOfLastYear = new Date(today.getFullYear() - 1, 11, 31)

  return [
    { label: 'Hoy', from: todayStr, to: todayStr },
    {
      label: 'Ayer',
      from: toLocalDateStr(yesterday),
      to: toLocalDateStr(yesterday),
    },
    { label: 'Esta semana', from: toLocalDateStr(thisMonday), to: todayStr },
    {
      label: 'Semana pasada',
      from: toLocalDateStr(lastMonday),
      to: toLocalDateStr(lastSunday),
    },
    {
      label: 'Últimas dos semanas',
      from: toLocalDateStr(twoWeeksAgo),
      to: todayStr,
    },
    { label: 'Este mes', from: toLocalDateStr(firstOfMonth), to: todayStr },
    {
      label: 'Mes pasado',
      from: toLocalDateStr(firstOfLastMonth),
      to: toLocalDateStr(lastOfLastMonth),
    },
    { label: 'Este año', from: toLocalDateStr(firstOfYear), to: todayStr },
    {
      label: 'Año pasado',
      from: toLocalDateStr(firstOfLastYear),
      to: toLocalDateStr(lastOfLastYear),
    },
  ]
}

export function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  // Buffers the first calendar click so we don't commit a half-range to the parent
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)

  // Stable across renders — presets only shift at midnight
  const presets = useMemo(getPresets, [])

  // What the calendar shows: pending first-click takes priority over committed state
  const calendarSelected: DateRange | undefined = useMemo(() => {
    const from = pendingFrom ?? dateFrom
    if (!from) return undefined
    return {
      from: new Date(`${from}T00:00:00`),
      to: !pendingFrom && dateTo ? new Date(`${dateTo}T00:00:00`) : undefined,
    }
  }, [pendingFrom, dateFrom, dateTo])

  const defaultMonth = useMemo(() => {
    const base = pendingFrom ?? dateFrom
    if (base) return new Date(`${base}T00:00:00`)
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d
  }, [pendingFrom, dateFrom])

  function handleSelect(range: DateRange | undefined) {
    if (!range?.from) {
      setPendingFrom(null)
      onChange('', '')
      return
    }
    const from = toLocalDateStr(range.from)
    if (!range.to) {
      // First click — buffer locally, don't touch parent state yet
      setPendingFrom(from)
      return
    }
    // Both ends chosen — commit and close
    const to = toLocalDateStr(range.to)
    setPendingFrom(null)
    onChange(from, to)
    setOpen(false)
  }

  function handlePreset(preset: { from: string; to: string }) {
    setPendingFrom(null)
    onChange(preset.from, preset.to)
    setOpen(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setPendingFrom(null)
    setOpen(nextOpen)
  }

  const activePreset = presets.find(
    (p) => p.from === dateFrom && p.to === dateTo
  )?.label

  let triggerLabel = 'Periodo'
  if (dateFrom && dateTo) {
    triggerLabel = `${formatShortDate(dateFrom)} – ${formatShortDate(dateTo)}`
  } else if (dateFrom) {
    triggerLabel = `Desde ${formatShortDate(dateFrom)}`
  }

  const isActive = Boolean(dateFrom || dateTo)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          aria-label="Filtro por periodo"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            height: 36,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: isActive ? 'var(--brand-soft)' : 'var(--surface-2)',
            color: isActive ? 'var(--brand-text)' : 'var(--text-faint)',
            border: isActive ? '1px solid var(--brand)' : '1px solid transparent',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <CalendarIcon size={13} />
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        style={{ width: 'auto', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 4px',
              minWidth: 160,
              borderRight: '1px solid var(--border)',
            }}
          >
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                style={{
                  textAlign: 'left',
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: activePreset === preset.label ? 600 : 400,
                  borderRadius: 6,
                  background:
                    activePreset === preset.label
                      ? 'var(--brand-soft)'
                      : 'transparent',
                  color:
                    activePreset === preset.label
                      ? 'var(--brand-text)'
                      : 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div>
            <Calendar
              mode="range"
              numberOfMonths={2}
              weekStartsOn={1}
              selected={calendarSelected}
              onSelect={handleSelect}
              defaultMonth={defaultMonth}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
