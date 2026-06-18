import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { CategoryBadge } from '../CategoryBadge'
import type { Transaction } from '../../models'
import type { AiConfig } from '../../services/ai/ai-config'
import type { AiEnrichmentInput } from '../../services/ai/transaction-ai'
import { enrichTransactionsWithAi } from '../../services/ai/transaction-ai'
import { buildCorrectionContext } from '../../services/ai/correction-context'
import { getCategoryDefinition } from '../../services/categories/category-registry'
import { categorizeTransaction } from '../../services/categorizer/transaction-categorizer'
import { getDescriptionOverride } from '../../services/descriptions/description-overrides'
import { getMerchantCategoryOverride } from '../../services/categorizer/category-overrides'
import { normalizeMerchantName } from '../../services/categorizer/merchant-patterns'

interface Props {
  transactions: Transaction[]
  claudeApiKey: string
  aiModel: string
}

type Source = 'override' | 'ai' | 'rules'

interface PreviewRow {
  id: string
  date: Date
  originalDescription: string
  storedCategory: string
  ruleCategory: string
  finalCategory: string
  aiDisplayDescription: string
  aiConfidence: number
  source: Source
  isDifferent: boolean
}

type RunState = 'idle' | 'running' | 'done' | 'error'

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function getLastMonthRange(): { year: number; month: number; label: string } {
  const now = new Date()
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const label = new Date(year, month, 1).toLocaleDateString('es-UY', {
    month: 'long',
    year: 'numeric',
  })
  return { year, month, label }
}

const SOURCE_LABEL: Record<Source, string> = {
  override: 'Override',
  ai: 'IA',
  rules: 'Reglas',
}

const SOURCE_COLOR: Record<Source, string> = {
  override: 'var(--text-muted)',
  ai: 'var(--accent)',
  rules: 'var(--text-muted)',
}

export function AiCategorizationPreview({
  transactions,
  claudeApiKey,
  aiModel,
}: Props) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false)

  const { year, month, label } = getLastMonthRange()

  const sample = useMemo(
    () =>
      transactions.filter((tx) => {
        const d = tx.date
        return d.getFullYear() === year && d.getMonth() === month
      }),
    [transactions, year, month]
  )

  const noKey = !claudeApiKey
  const noSample = sample.length === 0

  async function handleRun() {
    setRunState('running')
    setError(null)
    setRows([])

    try {
      const config: AiConfig = {
        apiKey: claudeApiKey,
        enabled: true,
        model: aiModel,
      }

      // Step 1: rule-based categorization on every transaction (no context,
      // matching what the CSV parsers do at import time)
      const ruleResults = new Map(
        sample.map((tx) => [tx.id, categorizeTransaction(tx.description, tx.type)])
      )

      // Step 2: apply same override filter as production
      const toEnrich: Transaction[] = []
      const overriddenIds = new Set<string>()

      for (const tx of sample) {
        const hasDescOverride = !!getDescriptionOverride(tx.description)
        const hasCatOverride = !!getMerchantCategoryOverride(
          normalizeMerchantName(tx.description)
        )
        if (hasDescOverride || hasCatOverride) {
          overriddenIds.add(tx.id)
        } else {
          toEnrich.push(tx)
        }
      }

      // Step 3: run AI only on non-overridden transactions
      const inputs: AiEnrichmentInput[] = toEnrich.map((tx) => ({
        id: tx.id,
        description: tx.description,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        source: tx.source,
      }))

      const aiResults = toEnrich.length > 0
        ? await enrichTransactionsWithAi(inputs, config, buildCorrectionContext())
        : new Map()

      // Step 4: build rows
      const built: PreviewRow[] = sample.map((tx) => {
        const ruleCat = getCategoryDefinition(
          ruleResults.get(tx.id)?.category ?? 'uncategorized'
        ).id
        const storedCat = getCategoryDefinition(tx.category ?? 'uncategorized').id
        const aiResult = aiResults.get(tx.id)

        let finalCategory: string
        let source: Source
        let aiDisplayDescription = tx.description
        let aiConfidence = 0

        if (overriddenIds.has(tx.id)) {
          finalCategory = ruleCat
          source = 'override'
        } else if (aiResult) {
          finalCategory = getCategoryDefinition(aiResult.category).id
          aiDisplayDescription = aiResult.displayDescription
          aiConfidence = aiResult.confidence
          source = 'ai'
        } else {
          finalCategory = ruleCat
          source = 'rules'
        }

        return {
          id: tx.id,
          date: tx.date,
          originalDescription: tx.description,
          storedCategory: storedCat,
          ruleCategory: ruleCat,
          finalCategory,
          aiDisplayDescription,
          aiConfidence,
          source,
          isDifferent: storedCat !== finalCategory,
        }
      })

      setRows(built)
      setRunState('done')
      console.debug('[AI Preview] sample:', sample.length, 'overridden:', overriddenIds.size, 'to AI:', toEnrich.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setRunState('error')
    }
  }

  const visibleRows = showOnlyDiffs ? rows.filter((r) => r.isDifferent) : rows
  const diffCount = rows.filter((r) => r.isDifferent).length
  const overrideCount = rows.filter((r) => r.source === 'override').length
  const aiCount = rows.filter((r) => r.source === 'ai').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {noKey && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Sin clave API configurada. Ingresá tu clave de Anthropic arriba para
          usar esta herramienta.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          onClick={handleRun}
          disabled={noKey || noSample || runState === 'running'}
          size="sm"
        >
          {runState === 'running' ? 'Procesando…' : 'Ejecutar preview de IA'}
        </Button>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {runState === 'running'
            ? `Procesando ${sample.length} transacciones de ${label}…`
            : noSample
              ? `Sin transacciones en ${label}`
              : `${sample.length} transacciones de ${label}`}
        </span>
      </div>

      {runState === 'error' && error && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--destructive)',
            margin: 0,
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
            borderRadius: 6,
          }}
        >
          {error}
        </p>
      )}

      {runState === 'done' && rows.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--foreground)' }}>{diffCount}</strong>{' '}
              diferencia{diffCount !== 1 ? 's' : ''} ·{' '}
              <strong style={{ color: 'var(--foreground)' }}>{aiCount}</strong> por IA ·{' '}
              <strong style={{ color: 'var(--foreground)' }}>{overrideCount}</strong> con override
            </span>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={showOnlyDiffs}
                onChange={(e) => setShowOnlyDiffs(e.target.checked)}
              />
              Solo mostrar diferencias
            </label>
          </div>

          <div
            style={{
              maxHeight: 480,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--surface-2)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {['Fecha', 'Descripción', 'Nombre sugerido', 'Almacenada', 'Final', 'Fuente', 'Confianza'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontWeight: 500,
                          color: 'var(--text-muted)',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderLeft: row.isDifferent
                        ? '3px solid var(--accent)'
                        : '3px solid transparent',
                      background: row.isDifferent
                        ? 'color-mix(in srgb, var(--accent) 5%, transparent)'
                        : 'transparent',
                    }}
                  >
                    <td style={cellStyle}>{formatDate(row.date)}</td>
                    <td
                      style={{
                        ...cellStyle,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.originalDescription}
                    >
                      {row.originalDescription}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        maxWidth: 160,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: row.source === 'ai' && row.aiDisplayDescription !== row.originalDescription
                          ? 'var(--foreground)'
                          : 'var(--text-muted)',
                      }}
                      title={row.aiDisplayDescription}
                    >
                      {row.source === 'ai' ? row.aiDisplayDescription : '—'}
                    </td>
                    <td style={cellStyle}>
                      <CategoryBadge categoryId={row.storedCategory} size="sm" />
                    </td>
                    <td style={cellStyle}>
                      <CategoryBadge categoryId={row.finalCategory} size="sm" />
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: SOURCE_COLOR[row.source],
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {SOURCE_LABEL[row.source]}
                      </span>
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color:
                          row.source !== 'ai'
                            ? 'var(--text-muted)'
                            : row.aiConfidence >= 0.8
                              ? 'var(--pos)'
                              : row.aiConfidence >= 0.55
                                ? 'var(--accent)'
                                : 'var(--neg)',
                      }}
                    >
                      {row.source === 'ai'
                        ? `${Math.round(row.aiConfidence * 100)}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}
