import { useState } from 'react'
import { Button } from '../ui/button'
import { CategoryBadge } from '../CategoryBadge'
import type { Transaction } from '../../models'
import type { AiConfig } from '../../services/ai/ai-config'
import type { AiEnrichmentInput } from '../../services/ai/transaction-ai'
import { enrichTransactionsWithAi } from '../../services/ai/transaction-ai'
import { listCustomCategories } from '../../services/categories/category-store'
import { getCategoryDefinition } from '../../services/categories/category-registry'

interface Props {
  transactions: Transaction[]
  claudeApiKey: string
  aiModel: string
}

interface PreviewRow {
  id: string
  date: Date
  originalDescription: string
  currentCategory: string
  aiCategory: string
  aiDisplayDescription: string
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

export function AiCategorizationPreview({
  transactions,
  claudeApiKey,
  aiModel,
}: Props) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false)

  const noKey = !claudeApiKey
  const noTransactions = transactions.length === 0

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

      const inputs: AiEnrichmentInput[] = transactions.map((tx) => ({
        id: tx.id,
        description: tx.description,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        source: tx.source,
      }))

      // Empty corrections — pure AI judgment, no learned overrides
      const results = await enrichTransactionsWithAi(inputs, config, {
        descriptionExamples: [],
        categoryExamples: [],
        customCategories: listCustomCategories(),
      })

      const built: PreviewRow[] = transactions.map((tx) => {
        const result = results.get(tx.id)
        const currentCat = getCategoryDefinition(tx.category ?? 'uncategorized').id
        const aiCat = result
          ? getCategoryDefinition(result.category).id
          : currentCat
        return {
          id: tx.id,
          date: tx.date,
          originalDescription: tx.description,
          currentCategory: currentCat,
          aiCategory: aiCat,
          aiDisplayDescription: result?.displayDescription ?? tx.description,
          isDifferent: currentCat !== aiCat,
        }
      })

      setRows(built)
      setRunState('done')
      // Log to console so the raw AI output is inspectable during dev
      console.debug('[AI Preview] results:', Object.fromEntries(results))
      console.debug('[AI Preview] rows built:', built.length, 'processed:', built.filter(r => r.aiDisplayDescription !== r.originalDescription || r.isDifferent).length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setRunState('error')
    }
  }

  const visibleRows = showOnlyDiffs ? rows.filter((r) => r.isDifferent) : rows
  const diffCount = rows.filter((r) => r.isDifferent).length
  const processedCount = rows.filter(
    (r) => r.aiDisplayDescription !== r.originalDescription || r.isDifferent
  ).length

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
          disabled={noKey || noTransactions || runState === 'running'}
          size="sm"
        >
          {runState === 'running' ? 'Procesando…' : 'Ejecutar preview de IA'}
        </Button>
        {runState === 'running' && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Procesando {transactions.length} transacciones — llamadas reales a
            la API de Anthropic
          </span>
        )}
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
              <strong style={{ color: 'var(--foreground)' }}>{processedCount}</strong>{' '}
              con resultado IA de{' '}
              {rows.length} transacciones
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
                  {['Fecha', 'Descripción original', 'Nombre sugerido', 'Categoría actual', 'Categoría IA'].map(
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
                    <td
                      style={{
                        padding: '8px 12px',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {formatDate(row.date)}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                      }}
                      title={row.originalDescription}
                    >
                      {row.originalDescription}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                      }}
                      title={row.aiDisplayDescription}
                    >
                      {row.aiDisplayDescription}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <CategoryBadge categoryId={row.currentCategory} size="sm" />
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <CategoryBadge categoryId={row.aiCategory} size="sm" />
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
