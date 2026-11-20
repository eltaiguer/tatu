import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryPicker } from './CategoryPicker'
import { replaceCustomCategories } from '../services/categories/category-store'

const optionNames = () =>
  screen
    .getAllByRole('button')
    .map((button) =>
      button.textContent
        ?.trim()
        .replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')
    )

describe('CategoryPicker', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('lists the categories without "Sin categoría"', () => {
    render(<CategoryPicker onPick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Restaurantes' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Sin categoría' })
    ).not.toBeInTheDocument()
  })

  it('marks the current category', () => {
    render(<CategoryPicker value="restaurants" onPick={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'Restaurantes' })
    ).toHaveAttribute('aria-current', 'true')
    expect(
      screen.getByRole('button', { name: 'Transporte' })
    ).not.toHaveAttribute('aria-current')
  })

  it('narrows the list as you type', async () => {
    render(<CategoryPicker onPick={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Buscar categoría'), 'trans')

    expect(optionNames().sort()).toEqual(
      [
        'Transferencias externas',
        'Transferencias internas',
        'Transporte',
      ].sort()
    )
  })

  it('picks the first match on Enter', async () => {
    const onPick = vi.fn()
    render(<CategoryPicker onPick={onPick} />)

    await userEvent.type(
      screen.getByLabelText('Buscar categoría'),
      'restau{Enter}'
    )

    expect(onPick.mock.calls).toEqual([['restaurants']])
  })

  it('moves from the search into the list with ArrowDown, and down it', async () => {
    render(<CategoryPicker onPick={vi.fn()} />)
    const first = screen.getAllByRole('button')[0]
    const second = screen.getAllByRole('button')[1]

    await userEvent.click(screen.getByLabelText('Buscar categoría'))
    await userEvent.keyboard('{ArrowDown}')
    expect(first).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(second).toHaveFocus()
  })

  it('picks the clicked category', async () => {
    const onPick = vi.fn()
    render(<CategoryPicker onPick={onPick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Transporte' }))

    expect(onPick.mock.calls).toEqual([['transport']])
  })

  it('says so when nothing matches', async () => {
    render(<CategoryPicker onPick={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Buscar categoría'), 'zzzz')

    expect(screen.getByText('Ninguna categoría coincide')).toBeVisible()
  })

  it('picks nothing on Enter while the search is empty', async () => {
    const onPick = vi.fn()
    render(<CategoryPicker onPick={onPick} />)

    await userEvent.click(screen.getByLabelText('Buscar categoría'))
    await userEvent.keyboard('{Enter}')

    expect(onPick).not.toHaveBeenCalled()
  })

  it('marks the current category of a legacy row (an alias of its id)', () => {
    render(<CategoryPicker value="food" onPick={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'Alimentación' })
    ).toHaveAttribute('aria-current', 'true')
  })
})
