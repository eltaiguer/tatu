import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): JSX.Element {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('renders fallback UI and calls reset', () => {
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <Bomb />
      </ErrorBoundary>
    )

    expect(screen.getByText('We hit an unexpected error.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(onReset).toHaveBeenCalled()
  })
})
