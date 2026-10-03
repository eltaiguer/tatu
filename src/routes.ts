import type { View } from './components/AppSidebar'

const VIEW_PATHS: Record<View, string> = {
  overview: '/',
  transactions: '/transacciones',
  insights: '/insights',
  categories: '/categorias',
  settings: '/configuracion',
}

const VIEW_TITLES: Record<View, string> = {
  overview: 'Resumen',
  transactions: 'Transacciones',
  insights: 'Insights',
  categories: 'Categorías',
  settings: 'Configuración',
}

export function pathForView(view: View): string {
  return VIEW_PATHS[view]
}

export function titleForView(view: View): string {
  return `${VIEW_TITLES[view]} · Tatú`
}

// Case- and trailing-slash-insensitive, so links mangled by chat/email
// clients still land. Unknown paths fall back to Resumen without a redirect
// (a redirect could strip a password-recovery hash before Supabase reads it).
export function viewFromPath(pathname: string): View {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  const match = (Object.keys(VIEW_PATHS) as View[]).find(
    (view) => VIEW_PATHS[view] === normalized
  )
  return match ?? 'overview'
}
