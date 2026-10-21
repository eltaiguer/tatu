import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewSkeleton } from './StateSkeletons'
import type { View } from './AppSidebar'

const VIEWS: View[] = [
  'overview',
  'transactions',
  'insights',
  'categories',
  'settings',
]

// #203: the skeletons were silent to screen readers during a slow sync.
describe('ViewSkeleton', () => {
  it.each(VIEWS)('announces the %s loading state as busy', (view) => {
    render(<ViewSkeleton view={view} />)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Cargando…')
  })
})
