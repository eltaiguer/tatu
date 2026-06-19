import { useState } from 'react'
import { Upload, Sparkles, PieChart } from 'lucide-react'
import { Button } from './ui/button'
import { TatuLogo } from './TatuLogo'

interface OnboardingProps {
  /** Open the import dialog. */
  onImport: () => void
  /** Optional: load sample data. Omit to hide the link. */
  onDemo?: () => void
  /** Optional first name for the greeting. */
  userName?: string
}

const STEPS = [
  {
    icon: Upload,
    title: 'Importás tu CSV',
    desc: 'Subí el extracto de tu tarjeta o caja de ahorro Santander.',
  },
  {
    icon: Sparkles,
    title: 'Tatú lo ordena',
    desc: 'Cada movimiento se categoriza solo con tus reglas.',
  },
  {
    icon: PieChart,
    title: 'Entendés tus gastos',
    desc: 'Resúmenes, tendencias y en qué se te va la plata.',
  },
]

/**
 * First-run welcome. Render from the dashboard / app shell when the user has
 * no transactions yet (transactions.length === 0).
 */
export function Onboarding({ onImport, onDemo, userName }: OnboardingProps) {
  const [dragActive, setDragActive] = useState(false)

  return (
    <div className="mx-auto max-w-[600px] px-6 py-14 text-center">
      <div className="flex justify-center">
        <TatuLogo size="lg" showText={false} />
      </div>

      <h1 className="font-display text-3xl font-semibold tracking-tight mt-5">
        Bienvenido a Tatú{userName ? `, ${userName}` : ''}
      </h1>
      <p
        className="text-muted-foreground mx-auto mt-2.5"
        style={{ maxWidth: 460 }}
      >
        Importá tu primer extracto de Santander y en segundos vas a ver todos tus
        gastos ordenados, en pesos y dólares.
      </p>

      <div className="grid grid-cols-1 gap-3 my-7 text-left sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div
            key={step.title}
            className="rounded-lg border border-border bg-card p-4"
          >
            <span
              className="grid place-items-center rounded-[10px] bg-primary/10 text-primary mb-3"
              style={{ width: 34, height: 34 }}
            >
              <step.icon size={17} />
            </span>
            <div className="font-mono text-[11px] font-semibold text-muted-foreground">
              PASO {index + 1}
            </div>
            <div className="font-medium mt-0.5">{step.title}</div>
            <div className="text-muted-foreground text-[13px] leading-snug mt-1">
              {step.desc}
            </div>
          </div>
        ))}
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          onImport()
        }}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        }`}
      >
        <span
          className="grid place-items-center rounded-xl bg-primary/10 text-primary mx-auto mb-3"
          style={{ width: 48, height: 48 }}
        >
          <Upload size={22} strokeWidth={2} />
        </span>
        <div className="font-medium">
          Arrastrá tu archivo CSV o seleccionalo
        </div>
        <p className="text-muted-foreground text-sm mt-1 mb-4">
          Detectamos el tipo de cuenta automáticamente
        </p>
        <Button onClick={onImport}>
          <Upload size={15} className="mr-1.5" />
          Seleccionar archivo CSV
        </Button>
      </div>

      {onDemo && (
        <p className="text-sm mt-4">
          <span className="text-muted-foreground">¿Solo querés mirar? </span>
          <button
            type="button"
            onClick={onDemo}
            className="text-primary font-semibold hover:underline"
          >
            Probar con datos de ejemplo
          </button>
        </p>
      )}
    </div>
  )
}
