import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthNav, monthChipLabel } from './MonthNav'
import type { UrlPeriod } from '../../services/filters/url-filters'

const NEWEST = new Date('2025-12-30T00:00:00.000Z')
const DEC_2025: UrlPeriod = { mode: 'month', y: 2025, m: 11 }

function renderNav(props: Partial<React.ComponentProps<typeof MonthNav>> = {}) {
  const setPeriod = vi.fn()
  render(
    <MonthNav
      period={DEC_2025}
      setPeriod={setPeriod}
      newest={NEWEST}
      monthCounts={new Map()}
      completeMonthKeys={new Set()}
      {...props}
    />
  )
  return setPeriod
}

function open(trigger = 'Diciembre 2025') {
  fireEvent.click(screen.getByRole('button', { name: trigger }))
}

const DATA = new Map([
  ['2025-03', 2],
  ['2025-11', 3],
  ['2025-12', 2],
])
const APR_TO_DEC = new Set([
  '2025-04',
  '2025-05',
  '2025-06',
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
])

describe('MonthNav month grid', () => {
  it('mutes months without rows and counts the rest, marking incomplete ones', () => {
    renderNav({ monthCounts: DATA, completeMonthKeys: APR_TO_DEC })
    open()

    const marzo = screen.getByRole('button', {
      name: 'marzo 2025, 2 movimientos, mes incompleto',
    })
    expect(marzo.getAttribute('title')).toBe('Le faltan datos de alguna cuenta')
    const noviembre = screen.getByRole('button', {
      name: 'noviembre 2025, 3 movimientos',
    })
    expect(noviembre.getAttribute('title')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'diciembre 2025, 2 movimientos' })
    ).toBeTruthy()
    for (const mes of [
      'enero',
      'febrero',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
    ]) {
      const chip = screen.getByRole('button', {
        name: `${mes} 2025, sin movimientos`,
      }) as HTMLButtonElement
      expect(chip.disabled).toBe(false)
    }
  })

  it('shows the count as the caption', () => {
    renderNav({ monthCounts: DATA, completeMonthKeys: APR_TO_DEC })
    open()
    const noviembre = screen.getByRole('button', {
      name: 'noviembre 2025, 3 movimientos',
    })
    expect(within(noviembre).getByText('3')).toBeTruthy()
  })

  it('still picks a month without rows', () => {
    const setPeriod = renderNav({
      monthCounts: DATA,
      completeMonthKeys: APR_TO_DEC,
    })
    open()
    fireEvent.click(
      screen.getByRole('button', { name: 'enero 2025, sin movimientos' })
    )
    expect(setPeriod).toHaveBeenCalledWith({ mode: 'month', y: 2025, m: 0 })
  })

  it('keeps empty months as Tab stops in calendar order', async () => {
    const user = userEvent.setup()
    renderNav({ monthCounts: DATA, completeMonthKeys: APR_TO_DEC })
    open()
    screen.getByRole('button', { name: 'enero 2025, sin movimientos' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'febrero 2025, sin movimientos' })
    )
    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', {
        name: 'marzo 2025, 2 movimientos, mes incompleto',
      })
    )
  })

  it('keeps future months disabled', () => {
    renderNav({
      period: { mode: 'month', y: 2025, m: 9 },
      newest: new Date('2025-10-15T00:00:00.000Z'),
      monthCounts: new Map(),
      completeMonthKeys: new Set(),
    })
    open('Octubre 2025')
    const future = screen.getByRole('button', {
      name: 'noviembre 2025, sin movimientos',
    }) as HTMLButtonElement
    expect(future.disabled).toBe(true)
  })
})

describe('monthChipLabel', () => {
  it('spells the count and the incomplete marker', () => {
    expect(monthChipLabel('enero 2025', 0, false)).toBe(
      'enero 2025, sin movimientos'
    )
    expect(monthChipLabel('marzo 2025', 1, false)).toBe(
      'marzo 2025, 1 movimiento'
    )
    expect(monthChipLabel('noviembre 2025', 12, true)).toBe(
      'noviembre 2025, 12 movimientos, mes incompleto'
    )
  })
})
