import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { captureError } from '../services/monitoring/error-reporting'

interface Props {
  children: ReactNode
  /** Changing it (e.g. moving to another view) clears a caught failure. */
  resetKey: string
  /** Runs before a reset re-renders the children (e.g. resetFailedViews). */
  onReset?: () => void
}

interface State {
  failed: boolean
}

/**
 * Catches a view that fails to render — typically its chunk failing to load
 * after a deploy replaced it — so the user gets a reload button instead of a
 * blank page. Moving to another view (`resetKey`) retries. It is reset by
 * prop rather than remounted by `key`: a remount would mount a fresh
 * Suspense boundary, which shows its fallback instead of letting the router's
 * transition keep the previous view on screen.
 */
export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.props.onReset?.()
      this.setState({ failed: false })
    }
  }

  componentDidCatch(error: unknown) {
    console.error('view failed to render:', error)
    captureError(error, 'view')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="flex min-h-[320px] flex-col items-center justify-center gap-[16px] px-[24px] py-[48px] text-center"
      >
        <div>
          <p className="mb-[6px] text-[16px] font-semibold">
            No se pudo cargar esta sección
          </p>
          <p className="mx-auto max-w-[320px] text-[14px] text-[var(--text-muted)]">
            Puede que la app se haya actualizado. Recargá la página para
            continuar.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw size={16} />
          Recargar
        </Button>
      </div>
    )
  }
}
