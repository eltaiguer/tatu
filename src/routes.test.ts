import { describe, expect, it } from 'vitest'
import { keepsQueryOnReselect, pathForView, viewFromPath } from './routes'

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

  it('keeps the query on re-select only where it holds filters', () => {
    // Transacciones' filters live in the query; Resumen's is a mode, so
    // re-selecting Resumen goes back to plain Todo.
    expect(keepsQueryOnReselect('transactions')).toBe(true)
    expect(keepsQueryOnReselect('overview')).toBe(false)
    expect(keepsQueryOnReselect('settings')).toBe(false)
  })
})
