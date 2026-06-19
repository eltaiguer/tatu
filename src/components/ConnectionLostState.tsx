import { CloudOff, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { EmptyState } from './EmptyState'

interface ConnectionLostStateProps {
  onRetry: () => void
  retrying?: boolean
}

/**
 * Shown when the initial Supabase load fails (network / fetch error).
 * NOTE: this app is online-only (see CLAUDE.md) — there is no offline write
 * buffer, so this is a "couldn't load, retry" state, NOT an "edits saved
 * offline" banner. Drive `retrying` from your refetch handler.
 */
export function ConnectionLostState({
  onRetry,
  retrying = false,
}: ConnectionLostStateProps) {
  return (
    <EmptyState
      icon={CloudOff}
      tone="neutral"
      title="No pudimos cargar tus movimientos"
      description="Parece que hay un problema de conexión. Revisá tu internet y volvé a intentar — tus datos están a salvo."
      action={
        <Button onClick={onRetry} disabled={retrying}>
          {retrying ? (
            <Loader2 size={15} className="mr-1.5 animate-spin" />
          ) : (
            <RefreshCw size={15} className="mr-1.5" />
          )}
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </Button>
      }
    />
  )
}
