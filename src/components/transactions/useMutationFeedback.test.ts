import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { PartialWriteError } from '../../utils/user-error'

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock(
  '../../services/monitoring/error-reporting',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../services/monitoring/error-reporting')
    >()),
    captureError: reporting.captureError,
  })
)
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

import { useMutationFeedback } from './useMutationFeedback'

describe('useMutationFeedback', () => {
  it('reports a partial write where it is shown, with the cause', () => {
    const { result } = renderHook(() => useMutationFeedback({}))
    const partial = new PartialWriteError(
      'Se actualizaron 2 de 3',
      2,
      3,
      undefined,
      undefined,
      new Error('statement timeout')
    )

    result.current.reportError(partial, 'No se pudo guardar')

    expect(reporting.captureError).toHaveBeenCalledWith(partial, 'write')
  })
})
