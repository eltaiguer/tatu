import { useState } from 'react'
import { Plus, Pencil, Trash, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Checkbox } from './ui/checkbox'
import type { Transaction } from '../models'
import { Category } from '../models'
import { getCategoryDefinitions } from '../services/categories/category-registry'
import {
  addCustomCategoryWithSync,
  removeCustomCategoryWithSync,
  updateCustomCategoryWithSync,
  upsertBuiltinOverrideWithSync,
} from '../services/categories/category-store'
import { getCategoryDisplay } from '../utils/category-display'
import {
  addCustomPattern,
  listCustomPatterns,
  removeCustomPattern,
  type MatchType,
} from '../services/categorizer/custom-patterns'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '../models/category'

interface CategoriesProps {
  transactions: Transaction[]
}

function getCategoryTransactionCount(
  transactions: Transaction[],
  categoryId: string
): number {
  return transactions.filter((tx) => {
    const txCat = getCategoryDisplay(tx.category).id
    const defCat = getCategoryDisplay(categoryId).id
    return txCat === defCat
  }).length
}

export function Categories({ transactions }: CategoriesProps) {
  const [, setCategoriesVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    id: '',
    label: '',
    color: '#0ea5e9',
    icon: '🏷️',
    isIgnored: false,
  })

  const [customPatterns, setCustomPatterns] = useState(() =>
    listCustomPatterns()
  )
  const [patternForm, setPatternForm] = useState({
    pattern: '',
    matchType: 'contains' as MatchType,
    category: Category.Groceries as string,
  })

  const categoryDefinitions = getCategoryDefinitions()
  const isEditing = form.id.length > 0
  const isEditingBuiltin =
    isEditing &&
    !categoryDefinitions.find((c) => c.id === form.id)?.isCustom

  function resetForm() {
    setForm({ id: '', label: '', color: '#0ea5e9', icon: '🏷️', isIgnored: false })
    setShowForm(false)
  }

  function openNewForm() {
    setForm({ id: '', label: '', color: '#0ea5e9', icon: '🏷️', isIgnored: false })
    setShowForm(true)
  }

  function startEdit(categoryId: string) {
    const cat = categoryDefinitions.find((c) => c.id === categoryId)
    if (!cat) return
    setForm({ id: cat.id, label: cat.label, color: cat.color, icon: cat.icon || '🏷️', isIgnored: cat.isIgnored ?? false })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.label.trim()) return
    if (isEditing) {
      const cat = categoryDefinitions.find((c) => c.id === form.id)
      if (cat?.isCustom) {
        await updateCustomCategoryWithSync(form.id, {
          label: form.label.trim(),
          color: form.color,
          icon: form.icon.trim() || '🏷️',
          isIgnored: form.isIgnored,
        })
      } else {
        await upsertBuiltinOverrideWithSync(form.id, {
          label: form.label.trim(),
          color: form.color,
          isIgnored: form.isIgnored,
        })
      }
    } else {
      await addCustomCategoryWithSync({
        label: form.label.trim(),
        color: form.color,
        icon: form.icon.trim() || '🏷️',
        isIgnored: form.isIgnored,
      })
    }
    resetForm()
    setCategoriesVersion((v) => v + 1)
  }

  async function handleDelete(categoryId: string) {
    await removeCustomCategoryWithSync(categoryId)
    if (form.id === categoryId) resetForm()
    setCategoriesVersion((v) => v + 1)
  }

  function handleAddPattern() {
    if (!patternForm.pattern.trim()) return
    addCustomPattern({
      pattern: patternForm.pattern,
      matchType: patternForm.matchType,
      category: patternForm.category,
    })
    setPatternForm({ pattern: '', matchType: 'contains', category: Category.Groceries })
    setCustomPatterns(listCustomPatterns())
  }

  function handleRemovePattern(id: string) {
    removeCustomPattern(id)
    setCustomPatterns(listCustomPatterns())
  }

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 28,
        }}
      >
        <div>
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
            Categorías y reglas
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Personalizá cómo Tatú clasifica tus movimientos
          </p>
        </div>
        <Button
          onClick={openNewForm}
          style={{
            background: 'var(--brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '9px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nueva categoría
        </Button>
      </div>

      {/* New / Edit category form */}
      {showForm && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>
              {isEditing ? 'Editar categoría' : 'Nueva categoría'}
            </h3>
            <button
              onClick={resetForm}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-faint)',
                display: 'grid',
                placeItems: 'center',
                padding: 4,
                borderRadius: 6,
              }}
              aria-label="Cancelar"
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isEditingBuiltin ? '1fr 120px' : '1fr 120px 120px', gap: 12, marginBottom: 16 }}>
            <div>
              <label
                htmlFor="cat-label"
                style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}
              >
                Nombre
              </label>
              <Input
                id="cat-label"
                aria-label="Nombre de categoría"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ej. Café"
              />
            </div>
            <div>
              <label
                htmlFor="cat-color"
                style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}
              >
                Color
              </label>
              <Input
                id="cat-color"
                aria-label="Color de categoría"
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-10"
              />
            </div>
            {!isEditingBuiltin && (
              <div>
                <label
                  htmlFor="cat-icon"
                  style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}
                >
                  Icono
                </label>
                <Input
                  id="cat-icon"
                  aria-label="Icono de categoría"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="🏷️"
                  maxLength={2}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <label
              htmlFor="cat-ignored"
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
            >
              <Checkbox
                id="cat-ignored"
                checked={form.isIgnored}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isIgnored: checked === true }))
                }
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Ignorar en totales</span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 6 }}>
                  Las transacciones de esta categoría no suman en gastos ni ingresos
                </span>
              </div>
            </label>
            <Button
              onClick={() => void handleSave()}
              disabled={!form.label.trim()}
              aria-label={isEditing ? 'Guardar cambios' : 'Guardar categoría'}
            >
              {isEditing ? 'Guardar cambios' : 'Guardar categoría'}
            </Button>
          </div>
        </div>
      )}

      {/* Category grid */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            color: 'var(--text)',
          }}
        >
          Tus categorías
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          {categoryDefinitions.map((cat) => {
            const count = getCategoryTransactionCount(transactions, cat.id)
            return (
              <div
                key={cat.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  position: 'relative',
                }}
              >
                {/* Icon tile */}
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: cat.color + '22',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {cat.icon}
                </span>

                {/* Name + count */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {cat.label}
                    {cat.isIgnored && (
                      <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-faint)', background: 'var(--border)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                        ignorada
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-faint)',
                      marginTop: 1,
                    }}
                  >
                    {count} {count === 1 ? 'movimiento' : 'movimientos'}
                  </div>
                </div>

                {/* Edit (all) / delete (custom only) */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => startEdit(cat.id)}
                    aria-label={`Editar categoría ${cat.label}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-faint)',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  {cat.isCustom && (
                    <button
                      onClick={() => void handleDelete(cat.id)}
                      aria-label={`Eliminar categoría ${cat.label}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--neg)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pattern rules */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          Reglas de auto-categorización
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Creá reglas para categorizar transacciones automáticamente según el texto de la descripción.
        </p>

        {/* Add pattern form */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto auto',
            gap: 10,
            marginBottom: 16,
            alignItems: 'flex-end',
          }}
        >
          <div>
            <label
              htmlFor="pattern-text"
              style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}
            >
              Patrón
            </label>
            <Input
              id="pattern-text"
              value={patternForm.pattern}
              onChange={(e) =>
                setPatternForm((p) => ({ ...p, pattern: e.target.value }))
              }
              placeholder='Ej. "farmacia"'
            />
          </div>
          <div>
            <label
              htmlFor="pattern-match"
              style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}
            >
              Tipo
            </label>
            <select
              id="pattern-match"
              value={patternForm.matchType}
              onChange={(e) =>
                setPatternForm((p) => ({
                  ...p,
                  matchType: e.target.value as MatchType,
                }))
              }
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                height: 40,
              }}
            >
              <option value="contains">Contiene</option>
              <option value="starts_with">Empieza con</option>
              <option value="exact">Exacto</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="pattern-category"
              style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-muted)' }}
            >
              Categoría
            </label>
            <select
              id="pattern-category"
              value={patternForm.category}
              onChange={(e) =>
                setPatternForm((p) => ({ ...p, category: e.target.value }))
              }
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                height: 40,
              }}
            >
              {Object.values(Category)
                .filter((c) => c !== Category.Uncategorized)
                .map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                  </option>
                ))}
            </select>
          </div>
          <Button
            onClick={handleAddPattern}
            disabled={!patternForm.pattern.trim()}
            aria-label="Agregar regla"
            style={{ height: 40 }}
          >
            <Plus size={15} />
          </Button>
        </div>

        {customPatterns.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customPatterns.map((cp) => {
              const catDisplay = getCategoryDisplay(cp.category)
              const matchLabel =
                cp.matchType === 'contains'
                  ? 'contiene'
                  : cp.matchType === 'starts_with'
                    ? 'empieza con'
                    : 'exacto'
              return (
                <div
                  key={cp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    background: 'var(--bg)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                      fontSize: 13,
                    }}
                  >
                    <Badge variant="outline">{matchLabel}</Badge>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      &quot;{cp.pattern}&quot;
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>→</span>
                    <Badge
                      style={{
                        backgroundColor: catDisplay.color + '20',
                        color: catDisplay.color,
                        border: 'none',
                      }}
                    >
                      {catDisplay.icon} {catDisplay.label}
                    </Badge>
                  </div>
                  <button
                    onClick={() => handleRemovePattern(cp.id)}
                    aria-label={`Eliminar regla ${cp.pattern}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--neg)',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 4,
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-faint)',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No hay reglas personalizadas. Creá una para categorizar automáticamente tus transacciones.
          </p>
        )}
      </div>
    </div>
  )
}
