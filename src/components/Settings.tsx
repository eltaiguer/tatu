import { useState } from 'react'
import { Download, Eye, EyeOff } from 'lucide-react'
import { Button } from './ui/button'
import { toast } from 'sonner'
import type { Transaction } from '../models'
import type { SupabaseSession } from '../services/supabase/client'
import { exportTransactions } from '../services/export/export'
import { CoverageAnalysis } from './dev/CoverageAnalysis'
import { AiCategorizationPreview } from './dev/AiCategorizationPreview'
import { AiPatternAnalysis } from './dev/AiPatternAnalysis'

interface SettingsProps {
  theme: 'light' | 'dark' | 'auto'
  onSetTheme: (t: 'light' | 'dark' | 'auto') => void
  preferredCurrency: 'UYU' | 'USD'
  onSetCurrency: (c: 'UYU' | 'USD') => void
  fxRate?: number
  onSetFxRate?: (r: number) => void
  session: SupabaseSession | null
  supabaseEnabled: boolean
  onSignOut: () => void
  transactions: Transaction[]
  onResetAllData?: () => Promise<void> | void
  claudeApiKey: string
  onSetClaudeApiKey: (key: string) => void
  aiEnabled: boolean
  onSetAiEnabled: (enabled: boolean) => void
  aiModel: string
  onSetAiModel: (model: string) => void
}

function SegmentControl({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-sm)',
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 14px',
            borderRadius: 7,
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: value === opt.value ? 600 : 500,
            background:
              value === opt.value ? 'var(--surface)' : 'transparent',
            color:
              value === opt.value ? 'var(--text)' : 'var(--text-muted)',
            boxShadow:
              value === opt.value
                ? '0 1px 3px oklch(0 0 0 / 0.08)'
                : 'none',
            transition: 'background 0.12s, color 0.12s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string
  description?: string
  control: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
      {control}
    </div>
  )
}

export function Settings({
  theme,
  onSetTheme,
  preferredCurrency,
  onSetCurrency,
  fxRate = 40.5,
  onSetFxRate,
  session,
  supabaseEnabled,
  onSignOut,
  transactions,
  onResetAllData,
  claudeApiKey,
  onSetClaudeApiKey,
  aiEnabled,
  onSetAiEnabled,
  aiModel,
  onSetAiModel,
}: SettingsProps) {
  const userEmail = session?.user?.email ?? ''
  const userName = userEmail ? userEmail.split('@')[0] : 'Usuario'
  const avatarInitial = userName.charAt(0).toUpperCase()
  const [showKey, setShowKey] = useState(false)

  function handleExport(format: 'csv' | 'pdf') {
    exportTransactions(transactions, { format })
    toast.success(
      format === 'csv'
        ? `CSV exportado: ${transactions.length} transacciones`
        : 'Reporte PDF generado'
    )
  }

  async function handleResetAllData() {
    const confirmed = window.confirm(
      'Esto eliminará todas tus transacciones y configuraciones. ¿Querés continuar?'
    )
    if (!confirmed || !onResetAllData) return
    await onResetAllData()
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: 6,
          }}
        >
          Configuración
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Apariencia, cuenta y tus datos
        </p>
      </div>

      {/* Apariencia */}
      <SectionCard title="Apariencia">
        <SettingRow
          label="Tema"
          description="Elegí cómo se ve Tatú"
          control={
            <SegmentControl
              options={[
                { label: 'Claro', value: 'light' },
                { label: 'Auto', value: 'auto' },
                { label: 'Oscuro', value: 'dark' },
              ]}
              value={theme}
              onChange={(v) => onSetTheme(v as 'light' | 'dark' | 'auto')}
            />
          }
        />
      </SectionCard>

      {/* Monedas */}
      <SectionCard title="Monedas">
        <SettingRow
          label="Moneda principal"
          description="Moneda en la que se convierten y combinan todos los totales"
          control={
            <SegmentControl
              options={[
                { label: 'Pesos $U', value: 'UYU' },
                { label: 'Dólares US$', value: 'USD' },
              ]}
              value={preferredCurrency}
              onChange={(v) => onSetCurrency(v as 'UYU' | 'USD')}
            />
          }
        />
        <SettingRow
          label="Tipo de cambio"
          description="Usado para convertir entre USD y UYU en resúmenes y análisis"
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                1 US$ =
              </span>
              <input
                type="number"
                min="0.01"
                step="0.5"
                value={fxRate}
                onChange={(e) => {
                  const n = parseFloat(e.target.value)
                  if (Number.isFinite(n) && n > 0) onSetFxRate?.(n)
                }}
                style={{
                  width: 72,
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  outline: 'none',
                  textAlign: 'right',
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>$U</span>
            </div>
          }
        />
      </SectionCard>

      {/* Inteligencia Artificial */}
      <SectionCard title="Inteligencia Artificial">
        <SettingRow
          label="Categorización con IA"
          description="Usa Claude para categorizar y limpiar los nombres de transacciones al importar"
          control={
            <button
              role="switch"
              aria-checked={aiEnabled}
              onClick={() => onSetAiEnabled(!aiEnabled)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: aiEnabled ? 'var(--accent)' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: aiEnabled ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          }
        />
        <SettingRow
          label="Clave API de Anthropic"
          description="Obtenela en console.anthropic.com · Se guarda en tu cuenta"
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={claudeApiKey}
                onChange={(e) => onSetClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                disabled={!aiEnabled}
                style={{
                  fontSize: 13,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: aiEnabled ? 'var(--input)' : 'var(--muted)',
                  color: aiEnabled ? 'var(--foreground)' : 'var(--text-muted)',
                  width: 180,
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                disabled={!aiEnabled}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: aiEnabled ? 'pointer' : 'default',
                  color: 'var(--text-muted)',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          }
        />
        <SettingRow
          label="Modelo"
          description="Haiku es más rápido y económico; Sonnet es más preciso"
          control={
            <div style={{ opacity: aiEnabled ? 1 : 0.5, pointerEvents: aiEnabled ? 'auto' : 'none' }}>
              <SegmentControl
                options={[
                  { label: 'Haiku', value: 'claude-haiku-4-5' },
                  { label: 'Sonnet', value: 'claude-sonnet-4-6' },
                ]}
                value={aiModel}
                onChange={onSetAiModel}
              />
            </div>
          }
        />
        {aiEnabled && claudeApiKey && (
          <div
            style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: '#22c55e' }}>✓</span>
            IA activa · se aplicará en tu próxima importación
          </div>
        )}
      </SectionCard>

      {/* Cuenta */}
      <SectionCard title="Cuenta">
        {supabaseEnabled && session ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    fontSize: 15,
                    flexShrink: 0,
                  }}
                >
                  {avatarInitial}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {userName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    {userEmail} · sincronizado en la nube
                  </div>
                </div>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'var(--pos-soft)',
                  color: 'var(--pos)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--pos)',
                    display: 'inline-block',
                  }}
                />
                Conectado
              </span>
            </div>
            <SettingRow
              label="Cerrar sesión"
              description="Salir de tu cuenta en este dispositivo"
              control={
                <Button
                  variant="outline"
                  onClick={onSignOut}
                  style={{ fontSize: 13 }}
                >
                  Salir
                </Button>
              }
            />
          </>
        ) : (
          <div style={{ padding: '16px 24px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Usás Tatú sin cuenta. Tus datos se guardan en este navegador.
            </p>
          </div>
        )}

        {/* Privacy copy */}
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--brand-soft)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--brand-text)', lineHeight: 1.5 }}>
            Tus movimientos se guardan cifrados en tu cuenta y se sincronizan de forma segura. Nunca compartimos tus datos financieros con terceros.
          </p>
        </div>
      </SectionCard>

      {/* Datos */}
      <SectionCard title="Datos">
        <SettingRow
          label="Exportar todo como CSV"
          description={`${transactions.length} transacciones`}
          control={
            <Button
              variant="outline"
              onClick={() => handleExport('csv')}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} />
              Exportar CSV
            </Button>
          }
        />
        <SettingRow
          label="Exportar como PDF"
          description="Reporte imprimible"
          control={
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} />
              Exportar PDF
            </Button>
          }
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            padding: '16px 24px',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neg)' }}>
              Eliminar todos los datos
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Borra todas las transacciones, categorías y reglas guardadas
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={() => void handleResetAllData()}
            disabled={!onResetAllData}
            style={{ fontSize: 13 }}
          >
            Resetear
          </Button>
        </div>
      </SectionCard>

      {import.meta.env.DEV && (
        <SectionCard title="[Dev] Cobertura del clasificador">
          <CoverageAnalysis session={session} />
        </SectionCard>
      )}

      {import.meta.env.DEV && (
        <SectionCard title="[Dev] Preview de categorización IA">
          <AiCategorizationPreview
            transactions={transactions}
            claudeApiKey={claudeApiKey}
            aiModel={aiModel}
          />
        </SectionCard>
      )}

      {import.meta.env.DEV && (
        <SectionCard title="[Dev] Análisis de patrones para prompt">
          <AiPatternAnalysis
            transactions={transactions}
            claudeApiKey={claudeApiKey}
            aiModel={aiModel}
          />
        </SectionCard>
      )}
    </div>
  )
}
