import { beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { Toaster } from 'sonner'
import { Settings } from './Settings'
import { UserFacingError } from '../utils/user-error'
import { CATEGORIZATION_MODELS } from '../services/ai/models'
import type { Transaction } from '../models'
import type { SupabaseSession } from '../services/supabase/client'
import { captureCsvDownload } from '../test/csv-download'
import { capturePrintFrame } from '../test/print-frame'

vi.mock('../services/supabase/client', () => ({
  isSupabaseConfigured: () => false,
}))

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'sample',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

const mockSession: SupabaseSession = {
  user: { id: 'user-1', email: 'jose@example.uy' },
} as unknown as SupabaseSession

const defaultAiProps = {
  claudeApiKey: '',
  onSetClaudeApiKey: () => {},
  aiEnabled: false,
  onSetAiEnabled: () => {},
  aiModel: 'claude-haiku-4-5',
  onSetAiModel: () => {},
}

describe('Settings', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the page heading and Apariencia section with all theme options', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
        {...defaultAiProps}
      />
    )

    expect(
      screen.getByRole('heading', { name: 'Configuración' })
    ).toBeInTheDocument()
    expect(screen.getByText('Apariencia')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Claro' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Auto' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Oscuro' })).toBeInTheDocument()
  })

  it('calls onSetTheme with the selected value when clicking a theme button', () => {
    const onSetTheme = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={onSetTheme}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
        {...defaultAiProps}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Oscuro' }))
    expect(onSetTheme).toHaveBeenCalledWith('dark')

    fireEvent.click(screen.getByRole('tab', { name: 'Auto' }))
    expect(onSetTheme).toHaveBeenCalledWith('auto')
  })

  it('calls onSetCurrency when clicking a currency button', () => {
    const onSetCurrency = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={onSetCurrency}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
        {...defaultAiProps}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Dólares US$' }))
    expect(onSetCurrency).toHaveBeenCalledWith('USD')
  })

  it('shows Conectado badge and sign-out button when session is active', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={mockSession}
        supabaseEnabled={true}
        onSignOut={() => {}}
        transactions={[]}
        {...defaultAiProps}
      />
    )

    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument()
  })

  it('calls onSignOut when clicking Salir', () => {
    const onSignOut = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={mockSession}
        supabaseEnabled={true}
        onSignOut={onSignOut}
        transactions={[]}
        {...defaultAiProps}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('shows the correct privacy copy', () => {
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
        {...defaultAiProps}
      />
    )

    // The copy must not promise data is never shared: the AI features send
    // it to Anthropic, and the user should know what goes out.
    expect(screen.queryByText(/Nunca compartimos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/cifrados/)).not.toBeInTheDocument()
    expect(
      screen.getByText(/las funciones de IA\s+los envían a Anthropic/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/la descripción, el monto y la moneda de cada/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/tus reglas y correcciones previas/)
    ).toBeInTheDocument()
  })

  it('calls onResetAllData after confirm on reset click', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined)

    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[makeTx()]}
        onResetAllData={onReset}
        {...defaultAiProps}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar todo',
      })
    )
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1))
  })

  it('shows an error, not success, when resetting fails', async () => {
    const onReset = vi
      .fn()
      .mockRejectedValue(
        new UserFacingError('No se pudieron borrar todos los datos.')
      )

    render(
      <>
        <Settings
          theme="light"
          onSetTheme={() => {}}
          preferredCurrency="UYU"
          onSetCurrency={() => {}}
          session={null}
          supabaseEnabled={false}
          onSignOut={() => {}}
          transactions={[makeTx()]}
          onResetAllData={onReset}
          {...defaultAiProps}
        />
        <Toaster />
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Resetear' }))
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar todo',
      })
    )

    expect(
      await screen.findByText('No se pudieron borrar todos los datos.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Datos eliminados')).not.toBeInTheDocument()
  })

  it('offers exactly the shared categorization models in the model picker', () => {
    const onSetAiModel = vi.fn()
    render(
      <Settings
        theme="light"
        onSetTheme={() => {}}
        preferredCurrency="UYU"
        onSetCurrency={() => {}}
        session={null}
        supabaseEnabled={false}
        onSignOut={() => {}}
        transactions={[]}
        {...defaultAiProps}
        aiEnabled
        onSetAiModel={onSetAiModel}
      />
    )

    const picker = screen.getByRole('tablist', { name: 'Modelo de IA' })
    const tabs = within(picker).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(
      CATEGORIZATION_MODELS.map((m) => m.label)
    )

    tabs.forEach((tab) => fireEvent.click(tab))
    expect(onSetAiModel.mock.calls.map(([id]) => id)).toEqual(
      CATEGORIZATION_MODELS.map((m) => m.id)
    )
    // Behavior unchanged: same two models as before.
    expect(CATEGORIZATION_MODELS.map((m) => m.id)).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-4-6',
    ])
  })

  function renderForPdfExport() {
    render(
      <>
        <Settings
          theme="light"
          onSetTheme={() => {}}
          preferredCurrency="UYU"
          onSetCurrency={() => {}}
          session={null}
          supabaseEnabled={false}
          onSignOut={() => {}}
          transactions={[makeTx({ description: 'Devoto Pocitos' })]}
          {...defaultAiProps}
        />
        <Toaster />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }))
  }

  it('prints the PDF report and only then says it was generated (#179)', async () => {
    const frame = capturePrintFrame()
    try {
      renderForPdfExport()

      expect(await screen.findByText('Reporte PDF generado')).toBeVisible()
      expect(frame.printed()).toHaveLength(1)
      expect(frame.printed()[0]).toContain('Devoto Pocitos')
    } finally {
      frame.restore()
    }
  })

  it('shows an error instead of a success toast when the PDF cannot open (#179)', async () => {
    const frame = capturePrintFrame({ failing: true })
    try {
      renderForPdfExport()

      expect(
        await screen.findByText(
          'No se pudo abrir el reporte PDF. Recargá la página e intentá de nuevo.'
        )
      ).toBeVisible()
      expect(screen.queryByText('Reporte PDF generado')).not.toBeInTheDocument()
    } finally {
      frame.restore()
    }
  })

  it('exports every row as a backup, flags what counts, and toasts the rows written', async () => {
    const csv = captureCsvDownload()
    try {
      render(
        <>
          <Settings
            theme="light"
            onSetTheme={() => {}}
            preferredCurrency="UYU"
            onSetCurrency={() => {}}
            session={null}
            supabaseEnabled={false}
            onSignOut={() => {}}
            transactions={[
              makeTx({ id: 'parent', amount: 1000, isSplitParent: true }),
              makeTx({ id: 'p1', amount: 600, splitParentId: 'parent' }),
              makeTx({ id: 'p2', amount: 400, splitParentId: 'parent' }),
              makeTx({ id: 'trf', amount: 50, category: 'internal_transfer' }),
            ]}
            {...defaultAiProps}
          />
          <Toaster />
        </>
      )

      fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }))

      expect(
        await screen.findByText('CSV exportado: 4 transacciones')
      ).toBeInTheDocument()

      const [header, ...rows] = await csv.rows()
      const flag = header.indexOf('cuenta_en_totales')
      expect(flag).toBeGreaterThan(-1)
      expect(rows.map((r) => [r[2], r[flag]])).toEqual([
        ['1000.00', '0'],
        ['600.00', '1'],
        ['400.00', '1'],
        ['50.00', '0'],
      ])
      // #124: summing only the rows that count gives the real 1,000.
      const counted = rows
        .filter((r) => r[flag] === '1')
        .reduce((sum, r) => sum + Number(r[2]), 0)
      expect(counted).toBe(1000)
    } finally {
      csv.restore()
    }
  })
})
