import { useState } from 'react'
import { PageHeader } from './ui/page-header'
import { Download, Eye, EyeOff } from 'lucide-react'
import { getFriendlyName } from '../utils/user-display'
import { Button } from './ui/button'
import { toast } from 'sonner'
import { userErrorMessage } from '../utils/user-error'
import type { Transaction } from '../models'
import type { SupabaseSession } from '../services/supabase/client'
import { exportTransactions } from '../services/export/export'
import { CoverageAnalysis } from './dev/CoverageAnalysis'
import { AiCategorizationPreview } from './dev/AiCategorizationPreview'
import { AiPatternAnalysis } from './dev/AiPatternAnalysis'
import { SectionCard } from './ui/card'
import { IconTile } from './ui/icon-tile'
import { SegmentedToggle } from './ui/segmented-toggle'
import { useConfirm } from './ConfirmDialog'
import { CATEGORIZATION_MODELS } from '../services/ai/models'

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

function SettingRow({
  label,
  description,
  control,
}: {
  label: string
  description?: React.ReactNode
  control: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-[24px] border-b border-[var(--border)] px-[24px] py-[16px]">
      <div>
        <div className="text-body font-semibold text-[var(--text)]">
          {label}
        </div>
        {description && (
          <div className="mt-[2px] text-label text-[var(--text-muted)]">
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
  const userName = getFriendlyName(session) || 'Usuario'
  const avatarInitial = userName.charAt(0).toUpperCase()
  const [showKey, setShowKey] = useState(false)
  const { confirm: confirmReset, dialog: confirmDialog } = useConfirm()

  function handleExport(format: 'csv' | 'pdf') {
    exportTransactions(transactions, { format })
    toast.success(
      format === 'csv'
        ? `CSV exportado: ${transactions.length} transacciones`
        : 'Reporte PDF generado'
    )
  }

  async function handleResetAllData() {
    if (!onResetAllData) return
    const confirmed = await confirmReset({
      title: '¿Eliminar todos los datos?',
      description:
        'Esto eliminará todas tus transacciones, categorías y reglas guardadas. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar todo',
    })
    if (!confirmed) return
    try {
      await onResetAllData()
      toast.success('Datos eliminados')
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudieron borrar los datos'))
    }
  }

  return (
    <div>
      <PageHeader
        className="mb-7"
        title="Configuración"
        subtitle="Apariencia, cuenta y tus datos"
      />

      {/* Apariencia */}
      <SectionCard title="Apariencia">
        <SettingRow
          label="Tema"
          description="Elegí cómo se ve Tatú"
          control={
            <SegmentedToggle
              options={[
                { label: 'Claro', value: 'light' as const },
                { label: 'Auto', value: 'auto' as const },
                { label: 'Oscuro', value: 'dark' as const },
              ]}
              value={theme}
              onChange={(v) => onSetTheme(v)}
              aria-label="Tema"
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
            <SegmentedToggle
              options={[
                { label: 'Pesos $U', value: 'UYU' as const },
                { label: 'Dólares US$', value: 'USD' as const },
              ]}
              value={preferredCurrency}
              onChange={(v) => onSetCurrency(v)}
              aria-label="Moneda principal"
            />
          }
        />
        <SettingRow
          label="Tipo de cambio"
          description="Usado para convertir entre USD y UYU en resúmenes y análisis"
          control={
            <div className="flex items-center gap-[8px]">
              <span className="text-small whitespace-nowrap text-[var(--text-muted)]">
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
                className="w-[72px] rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-[8px] py-[5px] text-right font-[family-name:var(--font-mono)] text-small text-[var(--text)] outline-none"
              />
              <span className="text-small text-[var(--text-muted)]">$U</span>
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
              className={`relative h-[24px] w-[44px] shrink-0 cursor-pointer rounded-[12px] border-none [transition:background_0.2s] ${
                aiEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
              }`}
            >
              <span
                className={`absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] [transition:left_0.2s] ${
                  aiEnabled ? 'left-[22px]' : 'left-[2px]'
                }`}
              />
            </button>
          }
        />
        <SettingRow
          label="Clave API de Anthropic"
          description={
            <>
              Obtenela en{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--brand)] underline"
              >
                console.anthropic.com
              </a>{' '}
              · El costo de uso es tuyo · Se guarda en tu cuenta
            </>
          }
          control={
            <div className="flex items-center gap-[6px]">
              <input
                type={showKey ? 'text' : 'password'}
                value={claudeApiKey}
                onChange={(e) => onSetClaudeApiKey(e.target.value)}
                placeholder="sk-ant-..."
                disabled={!aiEnabled}
                className={`w-[180px] rounded-[6px] border border-[var(--border)] px-[8px] py-[4px] font-[family-name:var(--font-mono)] text-small ${
                  aiEnabled
                    ? 'bg-[var(--input)] text-[var(--foreground)]'
                    : 'bg-[var(--muted)] text-[var(--text-muted)]'
                }`}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                disabled={!aiEnabled}
                className={`flex items-center border-none bg-transparent p-[4px] text-[var(--text-muted)] ${
                  aiEnabled ? 'cursor-pointer' : 'cursor-default'
                }`}
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
            <div
              className={
                aiEnabled
                  ? 'pointer-events-auto'
                  : 'pointer-events-none opacity-50'
              }
            >
              <SegmentedToggle
                options={CATEGORIZATION_MODELS.map(({ label, id }) => ({
                  label,
                  value: id,
                }))}
                value={aiModel}
                onChange={onSetAiModel}
                aria-label="Modelo de IA"
              />
            </div>
          }
        />
        {aiEnabled && claudeApiKey && (
          <div className="flex items-center gap-[6px] border-t border-[var(--border)] px-[16px] py-[8px] text-label text-[var(--text-muted)]">
            <span className="text-[var(--pos)]">✓</span>
            IA activa · se aplicará en tu próxima importación
          </div>
        )}
      </SectionCard>

      {/* Cuenta */}
      <SectionCard title="Cuenta">
        {supabaseEnabled && session ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-[24px] py-[16px]">
              <div className="flex items-center gap-[12px]">
                <IconTile
                  size="lg"
                  bg="var(--accent-soft)"
                  color="var(--accent)"
                  className="font-bold"
                >
                  {avatarInitial}
                </IconTile>
                <div>
                  <div className="text-body font-semibold">{userName}</div>
                  <div className="mt-[1px] text-label text-[var(--text-muted)]">
                    {userEmail} · sincronizado en la nube
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-[5px] rounded-[999px] bg-[var(--pos-soft)] px-[10px] py-[3px] text-label font-semibold text-[var(--pos)]">
                <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--pos)]" />
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
                  className="text-small leading-[1.428571]"
                >
                  Salir
                </Button>
              }
            />
          </>
        ) : (
          <div className="px-[24px] py-[16px]">
            <p className="text-small text-[var(--text-muted)]">
              Usás Tatú sin cuenta. Tus datos se guardan en este navegador.
            </p>
          </div>
        )}

        {/* Privacy copy */}
        <div className="border-t border-[var(--border)] bg-[var(--brand-soft)] px-[24px] py-[14px]">
          <p className="text-label leading-[1.5] text-[var(--brand-text)]">
            Tus movimientos se guardan en tu cuenta y solo vos podés verlos.
            Tatú no los comparte con nadie por su cuenta; las funciones de IA
            los envían a Anthropic con tu propia clave: la categorización manda
            la descripción, el monto y la moneda de cada movimiento que
            importás, junto con tus reglas y correcciones previas de nombres y
            categorías; los insights mandan tus totales por categoría y
            comercio.
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
              className="flex items-center gap-[6px] text-small leading-[1.428571]"
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
              className="flex items-center gap-[6px] text-small leading-[1.428571]"
            >
              <Download size={14} />
              Exportar PDF
            </Button>
          }
        />
        <div className="flex items-center justify-between gap-[24px] px-[24px] py-[16px]">
          <div>
            <div className="text-body font-semibold text-[var(--neg)]">
              Eliminar todos los datos
            </div>
            <div className="mt-[2px] text-label text-[var(--text-muted)]">
              Borra todas las transacciones, categorías y reglas guardadas
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={() => void handleResetAllData()}
            disabled={!onResetAllData}
            className="text-small leading-[1.428571]"
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

      {confirmDialog}
    </div>
  )
}
