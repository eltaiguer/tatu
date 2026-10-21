import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewErrorBoundary } from './ViewErrorBoundary'

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../services/monitoring/error-reporting', () => ({
  captureError: reporting.captureError,
}))

function ChunkThatFailed(): never {
  throw new TypeError('Failed to fetch dynamically imported module')
}

describe('ViewErrorBoundary', () => {
  it('renders the view when nothing fails', () => {
    render(
      <ViewErrorBoundary resetKey="overview">
        <p>Resumen</p>
      </ViewErrorBoundary>
    )
    expect(screen.getByText('Resumen')).toBeInTheDocument()
  })

  it('offers a reload instead of a blank page when a view fails to load', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ViewErrorBoundary resetKey="overview">
        <ChunkThatFailed />
      </ViewErrorBoundary>
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo cargar esta sección'
    )
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument()
  })

  it('reports the failure to Sentry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reporting.captureError.mockClear()
    render(
      <ViewErrorBoundary resetKey="overview">
        <ChunkThatFailed />
      </ViewErrorBoundary>
    )
    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.any(TypeError),
      'view'
    )
  })

  it('tries again when the user moves to another view', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ViewErrorBoundary resetKey="overview">
        <ChunkThatFailed />
      </ViewErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <ViewErrorBoundary resetKey="categories">
        <p>Categorías</p>
      </ViewErrorBoundary>
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Categorías')).toBeInTheDocument()
  })
})
