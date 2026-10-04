import { Suspense, type ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { resetFailedViews, retryableLazy } from './lazy-views'
import { ViewErrorBoundary } from './components/ViewErrorBoundary'

function Greeting({ name }: { name: string }) {
  return <p>Hola, {name}</p>
}

function renderView(View: ComponentType<{ name: string }>, resetKey: string) {
  return (
    <ViewErrorBoundary resetKey={resetKey} onReset={resetFailedViews}>
      <Suspense fallback={<p>cargando</p>}>
        <View name="Ana" />
      </Suspense>
    </ViewErrorBoundary>
  )
}

describe('retryableLazy', () => {
  it('renders the loaded view with its props', async () => {
    const View = retryableLazy(() => Promise.resolve(Greeting))
    render(renderView(View, 'overview'))
    expect(await screen.findByText('Hola, Ana')).toBeInTheDocument()
  })

  it('loads again after a failed load once the boundary resets', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi
      .fn<[], Promise<typeof Greeting>>()
      .mockRejectedValueOnce(
        new TypeError('Failed to fetch dynamically imported module')
      )
      .mockResolvedValue(Greeting)
    const View = retryableLazy(load)

    const { rerender } = render(renderView(View, 'settings'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // No retry storm while the chunk stays unreachable.
    expect(load).toHaveBeenCalledTimes(1)

    // Leaving and coming back resets the boundary; the view fetches again
    // instead of replaying the cached rejection.
    rerender(renderView(View, 'overview'))
    rerender(renderView(View, 'settings'))
    expect(await screen.findByText('Hola, Ana')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
