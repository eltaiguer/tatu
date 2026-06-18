import { useState } from 'react'
import { Button } from '../ui/button'
import type { Transaction } from '../../models'
import type { AiConfig } from '../../services/ai/ai-config'
import { analyzeTransactionPatterns } from '../../services/ai/prompt-analysis'

interface Props {
  transactions: Transaction[]
  claudeApiKey: string
  aiModel: string
}

type RunState = 'idle' | 'running' | 'done' | 'error'

export function AiPatternAnalysis({ transactions, claudeApiKey, aiModel }: Props) {
  const [runState, setRunState] = useState<RunState>('idle')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const noKey = !claudeApiKey
  const noTransactions = transactions.length === 0

  async function handleRun() {
    setRunState('running')
    setError(null)
    setOutput('')

    try {
      const config: AiConfig = { apiKey: claudeApiKey, enabled: true, model: aiModel }
      const result = await analyzeTransactionPatterns(transactions, config)
      setOutput(result)
      setRunState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setRunState('error')
    }
  }

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
          {runState === 'running' ? 'Analizando…' : 'Analizar patrones'}
        </Button>
        {runState === 'running' && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Analizando {transactions.length} transacciones con Claude…
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

      {runState === 'done' && output && (
        <textarea
          readOnly
          value={output}
          style={{
            width: '100%',
            height: 400,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface-2)',
            color: 'var(--foreground)',
            resize: 'vertical',
            lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  )
}
