import {
  Home,
  ListFilter,
  Sparkles,
  Tag,
  Settings,
  Upload,
  LogOut,
} from 'lucide-react'
import type { SupabaseSession } from '../services/supabase/client'
import { getFriendlyName } from '../utils/user-display'

export type View =
  | 'overview'
  | 'transactions'
  | 'insights'
  | 'categories'
  | 'settings'

interface NavGroup {
  label: string
  items: {
    id: View
    label: string
    icon: React.ElementType
    count?: number
    countTitle?: string
  }[]
}

interface AppSidebarProps {
  view: View
  onNavigate: (v: View) => void
  onImport: () => void
  onSignOut: () => void
  session: SupabaseSession | null
  // Transactions without a category (shown as a badge on Transacciones).
  uncategorizedCount: number
  supabaseEnabled: boolean
}

interface SidebarInnerProps extends AppSidebarProps {
  onClose?: () => void
}

export function BrandMark() {
  return (
    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--brand)] text-[var(--primary-foreground)] shadow-[var(--shadow-sm)]">
      <svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 17c0-5 4-9 9-9s9 4 9 9"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M7 17c0-3 2.2-5 5-5s5 2 5 5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.6"
        />
        <circle cx="12" cy="18.5" r="1.5" fill="currentColor" />
      </svg>
    </span>
  )
}

export function SidebarInner({
  view,
  onNavigate,
  onImport,
  onSignOut,
  session,
  uncategorizedCount,
  supabaseEnabled,
  onClose,
}: SidebarInnerProps) {
  const groups: NavGroup[] = [
    {
      label: 'General',
      items: [
        { id: 'overview', label: 'Resumen', icon: Home },
        {
          id: 'transactions',
          label: 'Transacciones',
          icon: ListFilter,
          count: uncategorizedCount > 0 ? uncategorizedCount : undefined,
          countTitle: `${uncategorizedCount} sin categoría`,
        },
        { id: 'insights', label: 'Insights', icon: Sparkles },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { id: 'categories', label: 'Categorías', icon: Tag },
        { id: 'settings', label: 'Configuración', icon: Settings },
      ],
    },
  ]

  const userEmail = session?.user?.email ?? ''
  const userName =
    getFriendlyName(session) ||
    (userEmail ? userEmail.split('@')[0] : 'Usuario')
  const avatarInitial = userName.charAt(0).toUpperCase()

  return (
    <div className="flex h-full flex-col overflow-y-auto px-[16px] pt-[22px] pb-[18px]">
      {/* Brand row */}
      <div className="flex items-center gap-[11px] px-[8px] pt-[4px] pb-[22px]">
        <BrandMark />
        <div>
          <div className="font-[family-name:var(--font-display)] text-[22px] leading-[1.1] font-semibold tracking-[-0.02em]">
            Tatú
          </div>
          <div className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-faint)] uppercase">
            Gastos · Uruguay
          </div>
        </div>
      </div>

      {/* Import button */}
      <button
        onClick={() => {
          onImport()
          onClose?.()
        }}
        className="flex w-full cursor-pointer items-center justify-center gap-[8px] rounded-[var(--radius-md)] border-none bg-[var(--brand)] px-[14px] py-[11px] font-[family-name:var(--font-sans)] text-[14px] font-semibold text-[var(--primary-foreground)] shadow-[var(--shadow-sm)] [transition:background_0.15s,transform_0.06s]"
        onMouseOver={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            'var(--brand-hover)')
        }
        onMouseOut={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background =
            'var(--brand)')
        }
        onMouseDown={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.transform =
            'translateY(1px)')
        }
        onMouseUp={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.transform = 'none')
        }
      >
        <span aria-hidden="true">
          <Upload size={15} strokeWidth={2.2} />
        </span>
        Importar
      </button>

      {/* Nav groups */}
      {groups.map((group) => (
        <nav key={group.label} className="mt-[22px]" aria-label={group.label}>
          <div className="px-[10px] pt-0 pb-[8px] text-[11px] font-bold tracking-[0.09em] text-[var(--text-faint)] uppercase">
            {group.label}
          </div>
          {group.items.map((item, i) => {
            const Icon = item.icon
            const isActive = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id)
                  onClose?.()
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex w-full cursor-pointer items-center gap-[11px] rounded-[var(--radius-sm)] border-none px-[10px] py-[9px] text-left font-[family-name:var(--font-sans)] text-[14px] [transition:background_0.13s,color_0.13s] ${
                  isActive ? 'font-semibold' : 'font-medium'
                } ${i > 0 ? 'mt-[2px]' : 'mt-0'}`}
                // background + color stay inline: the hover handlers below
                // write them inline, and React must keep re-asserting the
                // active/inactive values or a hover color sticks after a click.
                style={{
                  background: isActive ? 'var(--brand-soft)' : 'transparent',
                  color: isActive ? 'var(--brand-text)' : 'var(--text-muted)',
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      'var(--surface-2)'
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text)'
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      'transparent'
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text-muted)'
                  }
                }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[50%] left-[-16px] h-[20px] w-[3px] rounded-[0_3px_3px_0] bg-[var(--brand)] [transform:translateY(-50%)]"
                  />
                )}
                <span aria-hidden="true">
                  <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                <span className="flex-1">{item.label}</span>
                {item.count != null && (
                  <span
                    aria-hidden="true"
                    title={item.countTitle}
                    className={`rounded-[999px] px-[7px] py-[1px] font-[family-name:var(--font-mono)] text-[11px] ${
                      isActive
                        ? 'text-[var(--brand-text)]'
                        : 'text-[var(--text-faint)]'
                    }`}
                    // Inline: the CSS minifier rewrites oklch(1 0 0 / 0.35)
                    // as #ffffff59 (alpha 0.349), not a byte-identical color.
                    style={{
                      background: isActive
                        ? 'oklch(1 0 0 / 0.35)'
                        : 'var(--surface-2)',
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      ))}

      {/* Footer user row */}
      <div className="mt-auto pt-[16px]">
        <div className="flex items-center gap-[10px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-[10px] py-[9px]">
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-[var(--accent-soft)] text-[13px] font-bold text-[var(--accent)]">
            {avatarInitial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden text-[13px] font-semibold text-ellipsis whitespace-nowrap text-[var(--text)]">
              {userName}
            </div>
            {userEmail && (
              <div className="overflow-hidden text-[11px] text-ellipsis whitespace-nowrap text-[var(--text-faint)]">
                {userEmail}
              </div>
            )}
          </div>
          {supabaseEnabled && (
            <button
              onClick={onSignOut}
              title="Cerrar sesión"
              className="grid cursor-pointer place-items-center rounded-[6px] border-none bg-transparent p-[4px] text-[var(--text-faint)] [transition:color_0.12s]"
              onMouseOver={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color =
                  'var(--text)')
              }
              onMouseOut={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color =
                  'var(--text-faint)')
              }
              aria-label="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function AppSidebar(props: AppSidebarProps) {
  return (
    <aside className="fixed inset-[0_auto_0_0] z-40 hidden w-[var(--sidebar-w,252px)] border-r border-r-[var(--border)] bg-[var(--surface)] md:block">
      <SidebarInner {...props} />
    </aside>
  )
}
