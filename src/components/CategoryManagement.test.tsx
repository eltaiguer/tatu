import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CategoryManagement } from './CategoryManagement'

describe('CategoryManagement', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('adds a custom category', () => {
    render(<CategoryManagement />)

    fireEvent.change(screen.getByLabelText('New category name'), {
      target: { value: 'Coffee' },
    })
    fireEvent.change(screen.getByLabelText('New category color'), {
      target: { value: '#ff0000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))

    expect(screen.getByDisplayValue('Coffee')).toBeInTheDocument()
  })

  it('adds and removes a merchant rule', () => {
    render(<CategoryManagement />)

    fireEvent.change(screen.getByLabelText('Merchant name'), {
      target: { value: 'Netflix' },
    })
    fireEvent.change(screen.getByLabelText('Rule category'), {
      target: { value: 'entertainment' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))

    expect(screen.getByText('Netflix')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Netflix' }))
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()
  })
})
