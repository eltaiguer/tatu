import { describe, expect, it } from 'vitest'
import { pathForView, viewFromPath } from './routes'

describe('routes', () => {
  it('maps every view to a path and back', () => {
    for (const view of [
      'overview',
      'transactions',
      'insights',
      'categories',
      'settings',
    ] as const) {
      expect(viewFromPath(pathForView(view))).toBe(view)
    }
  })

  it('tolerates trailing slashes and capitalization', () => {
    expect(viewFromPath('/Transacciones/')).toBe('transactions')
    expect(viewFromPath('/categorias//')).toBe('categories')
  })

  it('falls back to Resumen for unknown paths', () => {
    expect(viewFromPath('/reset')).toBe('overview')
    expect(viewFromPath('')).toBe('overview')
  })
})
