import {
  Home,
  ListFilter,
  Tag,
  Settings,
  Upload,
  LogOut,
} from 'lucide-react'
import type { SupabaseSession } from '../services/supabase/client'

export type View = 'overview' | 'transactions' | 'categories' | 'settings'

interface NavGroup {
  label: string
  items: { id: View; label: string; icon: React.ElementType; count?: number }[]
}

interface AppSidebarProps {
  view: View
  onNavigate: (v: View) => void
  onImport: () => void
  onSignOut: () => void
  session: SupabaseSession | null
  txCount: number
  supabaseEnabled: boolean
}

interface SidebarInnerProps extends AppSidebarProps {
  onClose?: () => void
}

export function BrandMark() {
  return (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: 'var(--brand)',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
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
  txCount,
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
          count: txCount > 0 ? txCount : undefined,
        },
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
    session?.user?.user_metadata?.display_name ||
    (userEmail ? userEmail.split('@')[0] : 'Usuario')
  const avatarInitial = userName.charAt(0).toUpperCase()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '22px 16px 18px',
        overflowY: 'auto',
      }}
    >
      {/* Brand row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '4px 8px 22px',
        }}
      >
        <BrandMark />
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            Tatú
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
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
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          padding: '11px 14px',
          background: 'var(--brand)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          transition: 'background 0.15s, transform 0.06s',
        }}
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
        <nav
          key={group.label}
          style={{ marginTop: 22 }}
          aria-label={group.label}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--text-faint)',
              padding: '0 10px 8px',
            }}
          >
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  width: '100%',
                  padding: '9px 10px',
                  border: 'none',
                  background: isActive ? 'var(--brand-soft)' : 'transparent',
                  color: isActive ? 'var(--brand-text)' : 'var(--text-muted)',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.13s, color 0.13s',
                  position: 'relative',
                  marginTop: i > 0 ? 2 : 0,
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'var(--surface-2)'
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text)'
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'transparent'
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text-muted)'
                  }
                }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: -16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 20,
                      borderRadius: '0 3px 3px 0',
                      background: 'var(--brand)',
                    }}
                  />
                )}
                <span aria-hidden="true">
                  <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count != null && (
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: isActive ? 'var(--brand-text)' : 'var(--text-faint)',
                      background: isActive
                        ? 'oklch(1 0 0 / 0.35)'
                        : 'var(--surface-2)',
                      padding: '1px 7px',
                      borderRadius: 999,
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
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {avatarInitial}
          </span>
          <div
            style={{ minWidth: 0, flex: 1 }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: 'var(--text)',
              }}
            >
              {userName}
            </div>
            {userEmail && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {userEmail}
              </div>
            )}
          </div>
          {supabaseEnabled && (
            <button
              onClick={onSignOut}
              title="Cerrar sesión"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-faint)',
                display: 'grid',
                placeItems: 'center',
                padding: 4,
                borderRadius: 6,
                transition: 'color 0.12s',
              }}
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
    <aside
      className="hidden md:block"
      style={{
        position: 'fixed',
        inset: '0 auto 0 0',
        width: 'var(--sidebar-w, 252px)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        zIndex: 40,
      }}
    >
      <SidebarInner {...props} />
    </aside>
  )
}
