import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpDown,
  CreditCard,
  Pencil,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { CategoryBadge } from './CategoryBadge'
import { ConfidenceBadge } from './ConfidenceBadge'
import { Category } from '../models'
import type { Currency, Transaction } from '../models'

interface TransactionsProps {
  transactions: Transaction[]
  onUpdateTransaction?: (
    transactionId: string,
    updates: {
      description?: string
      category?: string
      tags?: string[]
    }
  ) => Promise<void> | void
  onDeleteTransaction?: (transactionId: string) => Promise<void> | void
}

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDirection = 'asc' | 'desc'

function formatCurrency(amount: number, currency: Currency): string {
  const absAmount = Math.abs(amount)
  const formatted = new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount)

  const symbol = currency === 'UYU' ? '$U' : 'US$'
  return `${symbol} ${formatted}`
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function isKnownCategory(categoryId: string): boolean {
  return Object.values(Category).includes(categoryId as Category)
}

export function Transactions({
  transactions,
  onUpdateTransaction,
  onDeleteTransaction,
}: TransactionsProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(
    null
  )

  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editTagList, setEditTagList] = useState<string[]>([])
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [newTagInput, setNewTagInput] = useState('')
  const [editError, setEditError] = useState('')

  const itemsPerPage = 20

  const filteredTransactions = useMemo(() => {
    const query = searchTerm.toLowerCase()
    const filtered = transactions.filter((transaction) => {
      const searchable =
        `${transaction.description} ${(transaction.tags ?? []).join(' ')}`.toLowerCase()
      return searchable.includes(query)
    })

    filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1

      if (sortField === 'date') {
        return (a.date.getTime() - b.date.getTime()) * direction
      }
      if (sortField === 'amount') {
        return (Math.abs(a.amount) - Math.abs(b.amount)) * direction
      }
      if (sortField === 'description') {
        return a.description.localeCompare(b.description, 'es') * direction
      }

      const aCategory = a.category ?? ''
      const bCategory = b.category ?? ''
      return aCategory.localeCompare(bCategory, 'es') * direction
    })

    return filtered
  }, [transactions, searchTerm, sortField, sortDirection])

  const categorySuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...Object.values(Category),
          ...transactions.map((tx) => tx.category ?? ''),
          editCategory,
        ]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'))
  }, [transactions, editCategory])

  const filteredCategorySuggestions = useMemo(() => {
    const query = newCategoryInput.trim().toLowerCase()
    if (!query) {
      return categorySuggestions
    }

    return categorySuggestions.filter((category) =>
      category.toLowerCase().includes(query)
    )
  }, [categorySuggestions, newCategoryInput])

  const tagSuggestions = useMemo(() => {
    return Array.from(
      new Set(
        [...transactions.flatMap((tx) => tx.tags ?? []), ...editTagList]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'))
  }, [transactions, editTagList])

  const filteredTagSuggestions = useMemo(() => {
    const query = newTagInput.trim().toLowerCase()
    if (!query) {
      return tagSuggestions
    }

    return tagSuggestions.filter((tag) =>
      tag.toLowerCase().includes(query)
    )
  }, [tagSuggestions, newTagInput])

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
  const safeTotalPages = Math.max(1, totalPages)

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, safeTotalPages))
  }, [safeTotalPages])

  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedTransactions = filteredTransactions.slice(
    startIndex,
    startIndex + itemsPerPage
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  const getAccountIcon = (type: string) => {
    if (type === 'credit_card') return <CreditCard size={14} />
    return <Wallet size={14} />
  }

  const getAccountLabel = (type: string) => {
    if (type === 'credit_card') return 'Tarjeta'
    return 'Cuenta'
  }

  function startEditTransaction(transaction: Transaction) {
    setEditingTransaction(transaction)
    setEditDescription(transaction.description)
    setEditCategory(transaction.category ?? '')
    setEditTagList(transaction.tags ?? [])
    setCategoryPickerOpen(false)
    setTagPickerOpen(false)
    setNewCategoryInput('')
    setNewTagInput('')
    setEditError('')
  }

  function resetEditState() {
    setEditingTransaction(null)
    setEditDescription('')
    setEditCategory('')
    setEditTagList([])
    setCategoryPickerOpen(false)
    setTagPickerOpen(false)
    setNewCategoryInput('')
    setNewTagInput('')
    setEditError('')
  }

  function handleAddCategory() {
    const value = newCategoryInput.trim()
    if (!value) return
    setEditCategory(value)
    setNewCategoryInput('')
  }

  function handleAddTag(tag: string) {
    const value = tag.trim()
    if (!value || editTagList.includes(value)) return
    setEditTagList((current) => [...current, value])
  }

  function handleAddInlineTag() {
    handleAddTag(newTagInput)
    setNewTagInput('')
  }

  function handleRemoveTag(tag: string) {
    setEditTagList((current) => current.filter((value) => value !== tag))
  }

  async function handleSaveEditTransaction() {
    if (!onUpdateTransaction || !editingTransaction) return

    const trimmedDescription = editDescription.trim()
    if (!trimmedDescription) {
      setEditError('La descripción no puede quedar vacía')
      return
    }

    setPendingTransactionId(editingTransaction.id)
    try {
      await onUpdateTransaction(editingTransaction.id, {
        description: trimmedDescription,
        category: editCategory.trim() || undefined,
        tags: editTagList,
      })
      resetEditState()
    } finally {
      setPendingTransactionId(null)
    }
  }

  async function handleDeleteTransaction(transaction: Transaction) {
    if (!onDeleteTransaction) return

    const confirmed = window.confirm(
      `¿Eliminar la transacción "${transaction.description}"?`
    )
    if (!confirmed) return

    setPendingTransactionId(transaction.id)
    try {
      await onDeleteTransaction(transaction.id)
    } finally {
      setPendingTransactionId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="mb-1">Transacciones</h2>
          <p className="text-muted-foreground">
            {filteredTransactions.length} transacciones encontradas
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={20}
          />
          <Input
            placeholder="Buscar por comercio o descripción..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('date')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Fecha
                    {sortField === 'date' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('description')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Descripción
                    {sortField === 'description' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    Categoría
                    {sortField === 'category' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-left p-4 text-sm font-medium">Confianza</th>
                <th className="text-left p-4 text-sm font-medium">Cuenta</th>
                <th className="text-right p-4 text-sm font-medium">
                  <button
                    onClick={() => handleSort('amount')}
                    className="flex items-center gap-2 ml-auto hover:text-primary transition-colors"
                  >
                    Monto
                    {sortField === 'amount' && <ArrowUpDown size={14} />}
                  </button>
                </th>
                <th className="text-center p-4 text-sm font-medium w-20">Acción</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {searchTerm
                      ? 'No hay transacciones que coincidan con la búsqueda'
                      : 'No hay transacciones para mostrar'}
                  </td>
                </tr>
              )}
              {paginatedTransactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="p-4">
                    <div className="text-sm">{formatDate(transaction.date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.date.toLocaleTimeString('es-UY', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{transaction.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {transaction.type === 'debit' ? 'Débito' : 'Crédito'}
                    </div>
                    {(transaction.tags ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(transaction.tags ?? []).map((tag) => (
                          <span
                            key={`${transaction.id}-${tag}`}
                            className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <CategoryBadge
                      categoryId={transaction.category || Category.Uncategorized}
                      size="sm"
                    />
                  </td>
                  <td className="p-4">
                    <ConfidenceBadge
                      confidence={transaction.categoryConfidence || 0}
                      manualOverride={false}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {getAccountIcon(transaction.source)}
                      <span>{getAccountLabel(transaction.source)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div
                      className={`font-mono ${
                        transaction.type === 'credit'
                          ? 'text-success-600'
                          : 'text-foreground'
                      }`}
                    >
                      {transaction.type === 'credit' ? '+' : '-'}
                      {formatCurrency(transaction.amount, transaction.currency)}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${transaction.description}`}
                        disabled={pendingTransactionId === transaction.id}
                        onClick={() => startEditTransaction(transaction)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Eliminar ${transaction.description}`}
                        disabled={pendingTransactionId === transaction.id}
                        onClick={() => {
                          void handleDeleteTransaction(transaction)
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-border">
          {paginatedTransactions.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {searchTerm
                ? 'No hay transacciones que coincidan con la búsqueda'
                : 'No hay transacciones para mostrar'}
            </div>
          )}
          {paginatedTransactions.map((transaction) => (
            <div key={transaction.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium mb-1">{transaction.description}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {formatDate(transaction.date)}
                  </div>
                </div>
                <div
                  className={`font-mono ${
                    transaction.type === 'credit'
                      ? 'text-success-600'
                      : 'text-foreground'
                  }`}
                >
                  {transaction.type === 'credit' ? '+' : '-'}
                  {formatCurrency(transaction.amount, transaction.currency)}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <CategoryBadge
                  categoryId={transaction.category || Category.Uncategorized}
                  size="sm"
                />
                {(transaction.tags ?? []).map((tag) => (
                  <span
                    key={`${transaction.id}-${tag}`}
                    className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                  >
                    #{tag}
                  </span>
                ))}
                <ConfidenceBadge
                  confidence={transaction.categoryConfidence || 0}
                  manualOverride={false}
                />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {getAccountIcon(transaction.source)}
                  {getAccountLabel(transaction.source)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Editar ${transaction.description}`}
                  disabled={pendingTransactionId === transaction.id}
                  onClick={() => startEditTransaction(transaction)}
                >
                  <Pencil size={14} />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Eliminar ${transaction.description}`}
                  disabled={pendingTransactionId === transaction.id}
                  onClick={() => {
                    void handleDeleteTransaction(transaction)
                  }}
                >
                  <Trash2 size={14} />
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={editingTransaction !== null} onOpenChange={(open) => !open && resetEditState()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar transacción</DialogTitle>
            <DialogDescription>
              Actualizá descripción, categoría y tags.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Input
                aria-label="Descripción edición"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Categoría</label>
              <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Categoría dropdown"
                    className="mt-1 w-full min-h-9 rounded-md border border-input bg-input-background px-2 py-1 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CategoryBadge
                        categoryId={
                          isKnownCategory(editCategory)
                            ? editCategory
                            : Category.Uncategorized
                        }
                        size="sm"
                      />
                      {editCategory && !isKnownCategory(editCategory) && (
                        <span className="text-xs text-muted-foreground">
                          {editCategory}
                        </span>
                      )}
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                  <div className="p-2 space-y-2">
                    <Input
                      aria-label="Nueva categoría"
                      value={newCategoryInput}
                      onChange={(event) => setNewCategoryInput(event.target.value)}
                      placeholder="Buscar o crear categoría"
                    />
                    <div
                      className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheel={(event) => event.stopPropagation()}
                      onTouchMove={(event) => event.stopPropagation()}
                    >
                        <button
                          type="button"
                          className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            setEditCategory('')
                            setCategoryPickerOpen(false)
                          }}
                        >
                          <CategoryBadge
                            categoryId={Category.Uncategorized}
                            size="sm"
                          />
                        </button>
                        {filteredCategorySuggestions.map((category) => (
                          <button
                            key={category}
                            type="button"
                            className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => {
                              setEditCategory(category)
                              setCategoryPickerOpen(false)
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <CategoryBadge
                                categoryId={
                                  isKnownCategory(category)
                                    ? category
                                    : Category.Uncategorized
                                }
                                size="sm"
                              />
                              {!isKnownCategory(category) && (
                                <span className="text-xs text-muted-foreground">
                                  {category}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Crear categoría"
                      className="w-full"
                      onClick={() => {
                        handleAddCategory()
                        setCategoryPickerOpen(false)
                      }}
                    >
                      Crear categoría
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium">Tags</label>
              <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Tags dropdown"
                    className="mt-1 w-full h-9 rounded-md border border-input bg-input-background px-3 text-sm text-left hover:bg-muted/50"
                  >
                    {editTagList.length > 0
                      ? `${editTagList.length} tags seleccionados`
                      : 'Sin tags'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[320px]" align="start">
                  <div className="p-2 space-y-2">
                    <Input
                      aria-label="Nuevo tag"
                      value={newTagInput}
                      onChange={(event) => setNewTagInput(event.target.value)}
                      placeholder="Buscar o crear tag"
                    />
                    <div
                      className="max-h-44 overflow-y-auto overscroll-contain space-y-1 pr-2"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheel={(event) => event.stopPropagation()}
                      onTouchMove={(event) => event.stopPropagation()}
                    >
                        {filteredTagSuggestions.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => {
                              handleAddTag(tag)
                              setTagPickerOpen(false)
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Crear tag"
                      className="w-full"
                      onClick={() => {
                        handleAddInlineTag()
                        setTagPickerOpen(false)
                      }}
                    >
                      Crear tag
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {editTagList.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {editTagList.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      aria-label={`Quitar tag ${tag}`}
                      onClick={() => handleRemoveTag(tag)}
                      className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {editError && (
              <p className="text-sm text-destructive" role="alert">
                {editError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetEditState}
              disabled={Boolean(editingTransaction && pendingTransactionId === editingTransaction.id)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleSaveEditTransaction()
              }}
              disabled={Boolean(editingTransaction && pendingTransactionId === editingTransaction.id)}
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTransactions.length === 0
            ? 'Mostrando 0 de 0'
            : `Mostrando ${startIndex + 1}-${Math.min(
                startIndex + itemsPerPage,
                filteredTransactions.length
              )} de ${filteredTransactions.length}`}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
              const page = index + 1
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-10"
                >
                  {page}
                </Button>
              )
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === safeTotalPages}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
