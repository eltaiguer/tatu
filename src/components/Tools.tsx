// Tools - Filters, Export, Category Management

import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { CategoryBadge } from './CategoryBadge';
import { ListFilter, Download, Plus, Pencil, Trash, FileText, Settings } from 'lucide-react';
import type { Transaction } from '../models';
import { Category } from '../models';
import { categories } from '../utils/figma-data';
import { useState } from 'react';
import { getCategoryDefinitions } from '../services/categories/category-registry';
import {
  addCustomCategoryWithSync,
  removeCustomCategoryWithSync,
  updateCustomCategoryWithSync,
} from '../services/categories/category-store';
import { getCategoryDisplay } from '../utils/category-display';
import {
  addCustomPattern,
  listCustomPatterns,
  removeCustomPattern,
  type MatchType,
} from '../services/categorizer/custom-patterns';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '../models/category';


interface ToolsProps {
  transactions: Transaction[];
  onResetAllData?: () => Promise<void> | void;
}

export function Tools({ transactions, onResetAllData }: ToolsProps) {
  const [activeTab, setActiveTab] = useState<'filters' | 'export' | 'categories' | 'settings'>('filters');
  const [, setCategoriesVersion] = useState(0);
  const [customCategoryForm, setCustomCategoryForm] = useState({
    id: '',
    label: '',
    color: '#0ea5e9',
    icon: '🏷️',
  });

  // Custom pattern states
  const [customPatterns, setCustomPatterns] = useState(() => listCustomPatterns());
  const [patternForm, setPatternForm] = useState({
    pattern: '',
    matchType: 'contains' as MatchType,
    category: Category.Groceries as string,
  });

  const handleAddPattern = () => {
    if (!patternForm.pattern.trim()) return;
    addCustomPattern({
      pattern: patternForm.pattern,
      matchType: patternForm.matchType,
      category: patternForm.category,
    });
    setPatternForm({ pattern: '', matchType: 'contains', category: Category.Groceries });
    setCustomPatterns(listCustomPatterns());
  };

  const handleRemovePattern = (id: string) => {
    removeCustomPattern(id);
    setCustomPatterns(listCustomPatterns());
  };

  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [amountRange, setAmountRange] = useState({ min: '', max: '' });
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setDateRange({ start: '', end: '' });
    setAmountRange({ min: '', max: '' });
    setSelectedCurrency('all');
  };

  const activeFiltersCount = 
    selectedCategories.length + 
    (dateRange.start || dateRange.end ? 1 : 0) + 
    (amountRange.min || amountRange.max ? 1 : 0) +
    (selectedCurrency !== 'all' ? 1 : 0);

  const categoryDefinitions = getCategoryDefinitions();

  const refreshCategoryDefinitions = () => {
    setCategoriesVersion((value) => value + 1);
  };

  const isEditingCustomCategory = customCategoryForm.id.length > 0;

  const resetCustomCategoryForm = () => {
    setCustomCategoryForm({
      id: '',
      label: '',
      color: '#0ea5e9',
      icon: '🏷️',
    })
  }

  const handleCreateCustomCategory = async () => {
    if (!customCategoryForm.label.trim()) {
      return
    }

    await addCustomCategoryWithSync({
      label: customCategoryForm.label.trim(),
      color: customCategoryForm.color,
      icon: customCategoryForm.icon.trim() || '🏷️',
    })
    resetCustomCategoryForm()
    refreshCategoryDefinitions()
  };

  const startEditingCustomCategory = (categoryId: string) => {
    const category = categoryDefinitions.find((entry) => entry.id === categoryId)
    if (!category || !category.isCustom) {
      return
    }

    setCustomCategoryForm({
      id: category.id,
      label: category.label,
      color: category.color,
      icon: category.icon || '🏷️',
    })
  }

  const handleEditCustomCategory = async () => {
    if (!customCategoryForm.id || !customCategoryForm.label.trim()) {
      return
    }
    await updateCustomCategoryWithSync(customCategoryForm.id, {
      label: customCategoryForm.label.trim(),
      color: customCategoryForm.color,
      icon: customCategoryForm.icon.trim() || '🏷️',
    })
    resetCustomCategoryForm()
    refreshCategoryDefinitions()
  };

  const handleDeleteCustomCategory = async (categoryId: string) => {
    await removeCustomCategoryWithSync(categoryId)
    if (customCategoryForm.id === categoryId) {
      resetCustomCategoryForm()
    }
    refreshCategoryDefinitions()
  };

  const getCategoryAmountTotal = (categoryId: string): number =>
    Math.abs(
      transactions
        .filter((transaction) => {
          const transactionCategory = getCategoryDisplay(transaction.category).id
          const definitionCategory = getCategoryDisplay(categoryId).id
          return (
            transaction.type === 'debit' &&
            transactionCategory === definitionCategory
          )
        })
        .reduce((sum, transaction) => sum + transaction.amount, 0)
    );

  const getCategoryTransactionCount = (categoryId: string): number =>
    transactions.filter((transaction) => {
      const transactionCategory = getCategoryDisplay(transaction.category).id
      const definitionCategory = getCategoryDisplay(categoryId).id
      return transactionCategory === definitionCategory
    }).length;

  const handleResetAllData = async () => {
    const confirmed = window.confirm(
      'Esto eliminará todas tus transacciones y configuraciones. ¿Querés continuar?'
    )
    if (!confirmed || !onResetAllData) {
      return
    }

    await onResetAllData()
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="mb-1">Herramientas</h2>
        <p className="text-muted-foreground">Filtros, exportación y configuración</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('filters')}
          className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'filters'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <ListFilter size={18} />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFiltersCount}
              </Badge>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'export'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Download size={18} />
            <span>Exportar</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'categories'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Plus size={18} />
            <span>Categorías</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Settings size={18} />
            <span>Configuración</span>
          </div>
        </button>
      </div>

      {/* Filters Tab */}
      {activeTab === 'filters' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3>Filtros Avanzados</h3>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpiar todos
              </Button>
            )}
          </div>

          {/* Active Filters Chips */}
          {activeFiltersCount > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Activos:</span>
                {selectedCategories.map(catId => (
                  <Badge key={catId} variant="secondary" className="gap-1">
                    {categories.find(c => c.id === catId)?.name}
                    <button 
                      onClick={() => toggleCategory(catId)}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
                {(dateRange.start || dateRange.end) && (
                  <Badge variant="secondary">
                    Rango de fechas
                    <button 
                      onClick={() => setDateRange({ start: '', end: '' })}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {(amountRange.min || amountRange.max) && (
                  <Badge variant="secondary">
                    Rango de monto
                    <button 
                      onClick={() => setAmountRange({ min: '', max: '' })}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {selectedCurrency !== 'all' && (
                  <Badge variant="secondary">
                    {selectedCurrency}
                    <button 
                      onClick={() => setSelectedCurrency('all')}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                )}
              </div>
            </Card>
          )}

          {/* Category Filter */}
          <Card className="p-6">
            <h4 className="mb-4">Categorías</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    selectedCategories.includes(category.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <CategoryBadge categoryId={category.id} size="sm" />
                </button>
              ))}
            </div>
          </Card>

          {/* Date Range Filter */}
          <Card className="p-6">
            <h4 className="mb-4">Rango de Fechas</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tools-date-start" className="block text-sm mb-2">
                  Desde
                </label>
                <Input
                  id="tools-date-start"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="tools-date-end" className="block text-sm mb-2">
                  Hasta
                </label>
                <Input
                  id="tools-date-end"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
            </div>
          </Card>

          {/* Amount Range Filter */}
          <Card className="p-6">
            <h4 className="mb-4">Rango de Monto</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tools-amount-min" className="block text-sm mb-2">
                  Mínimo
                </label>
                <Input
                  id="tools-amount-min"
                  type="number"
                  placeholder="0.00"
                  value={amountRange.min}
                  onChange={(e) => setAmountRange(prev => ({ ...prev, min: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="tools-amount-max" className="block text-sm mb-2">
                  Máximo
                </label>
                <Input
                  id="tools-amount-max"
                  type="number"
                  placeholder="999999.99"
                  value={amountRange.max}
                  onChange={(e) => setAmountRange(prev => ({ ...prev, max: e.target.value }))}
                />
              </div>
            </div>
          </Card>

          {/* Currency Filter */}
          <Card className="p-6">
            <h4 className="mb-4">Moneda</h4>
            <div className="flex gap-3">
              <Button
                variant={selectedCurrency === 'all' ? 'default' : 'outline'}
                onClick={() => setSelectedCurrency('all')}
              >
                Todas
              </Button>
              <Button
                variant={selectedCurrency === 'UYU' ? 'default' : 'outline'}
                onClick={() => setSelectedCurrency('UYU')}
              >
                Pesos (UYU)
              </Button>
              <Button
                variant={selectedCurrency === 'USD' ? 'default' : 'outline'}
                onClick={() => setSelectedCurrency('USD')}
              >
                Dólares (USD)
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <h3>Exportar Datos</h3>

          <Card className="p-6">
            <h4 className="mb-4">Formato de Exportación</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button className="p-6 border-2 border-border hover:border-primary rounded-lg transition-all text-left group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <FileText size={24} />
                  </div>
                  <div>
                    <p className="font-medium">CSV</p>
                    <p className="text-sm text-muted-foreground">Excel compatible</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Exportar como archivo CSV para usar en Excel, Google Sheets, o importar a otras herramientas.
                </p>
              </button>

              <button className="p-6 border-2 border-border hover:border-primary rounded-lg transition-all text-left group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                    <FileText size={24} />
                  </div>
                  <div>
                    <p className="font-medium">PDF</p>
                    <p className="text-sm text-muted-foreground">Reporte imprimible</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Generar un reporte en PDF con resúmenes, gráficos y detalles de transacciones.
                </p>
              </button>
            </div>
          </Card>

          <Card className="p-6">
            <h4 className="mb-4">Opciones de Exportación</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tools-export-start" className="block text-sm mb-2">
                    Fecha inicial
                  </label>
                  <Input id="tools-export-start" type="date" defaultValue="2024-01-01" />
                </div>
                <div>
                  <label htmlFor="tools-export-end" className="block text-sm mb-2">
                    Fecha final
                  </label>
                  <Input id="tools-export-end" type="date" defaultValue="2024-12-29" />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Incluir gráficos</p>
                  <p className="text-sm text-muted-foreground">Solo para PDF</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Agrupar por categoría</p>
                  <p className="text-sm text-muted-foreground">Incluir subtotales</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button className="flex-1">
              <Download size={18} className="mr-2" />
              Exportar como CSV
            </Button>
            <Button variant="secondary" className="flex-1">
              <Download size={18} className="mr-2" />
              Exportar como PDF
            </Button>
          </div>

          <Card className="p-4 bg-primary-50 dark:bg-primary-900/10 border-primary/20">
            <p className="text-sm">
              <strong>Nota:</strong> La exportación incluirá {transactions.length} transacciones 
              según los filtros activos. El archivo estará listo en unos segundos.
            </p>
          </Card>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3>Gestión de Categorías</h3>
            <Button
              onClick={() => {
                resetCustomCategoryForm()
              }}
            >
              <Plus size={18} className="mr-2" />
              Nueva Categoría
            </Button>
          </div>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4>{isEditingCustomCategory ? 'Editar categoría' : 'Nueva categoría'}</h4>
                <p className="text-sm text-muted-foreground">
                  Definí el nombre, color e icono de tus categorías personalizadas.
                </p>
              </div>
              {isEditingCustomCategory && (
                <Button variant="ghost" onClick={resetCustomCategoryForm}>
                  Cancelar
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.5fr_140px_140px] gap-4">
              <div>
                <label htmlFor="tools-category-label" className="block text-sm mb-2">
                  Nombre de la categoría
                </label>
                <Input
                  id="tools-category-label"
                  aria-label="Nombre de categoría"
                  value={customCategoryForm.label}
                  onChange={(event) =>
                    setCustomCategoryForm((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                  placeholder="Ej. Café"
                />
              </div>
              <div>
                <label htmlFor="tools-category-color" className="block text-sm mb-2">
                  Color
                </label>
                <Input
                  id="tools-category-color"
                  aria-label="Color de categoría"
                  type="color"
                  value={customCategoryForm.color}
                  onChange={(event) =>
                    setCustomCategoryForm((current) => ({
                      ...current,
                      color: event.target.value,
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div>
                <label htmlFor="tools-category-icon" className="block text-sm mb-2">
                  Icono
                </label>
                <Input
                  id="tools-category-icon"
                  aria-label="Icono de categoría"
                  value={customCategoryForm.icon}
                  onChange={(event) =>
                    setCustomCategoryForm((current) => ({
                      ...current,
                      icon: event.target.value,
                    }))
                  }
                  placeholder="🏷️"
                  maxLength={2}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 bg-muted/20">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Vista previa</p>
                <CategoryBadge
                  categoryId={
                    isEditingCustomCategory && customCategoryForm.id
                      ? customCategoryForm.id
                      : 'custom-category-preview'
                  }
                  showIcon={false}
                />
                <span
                  className="ml-3 inline-flex items-center gap-2 text-sm font-medium"
                  style={{ color: customCategoryForm.color }}
                >
                  <span>{customCategoryForm.icon || '🏷️'}</span>
                  <span>{customCategoryForm.label.trim() || 'Nueva categoría'}</span>
                </span>
              </div>
              <Button
                onClick={() =>
                  void (isEditingCustomCategory
                    ? handleEditCustomCategory()
                    : handleCreateCustomCategory())
                }
                disabled={!customCategoryForm.label.trim()}
                aria-label="Guardar categoría"
              >
                {isEditingCustomCategory ? 'Guardar cambios' : 'Guardar categoría'}
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categoryDefinitions.map(category => (
              <Card key={category.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <CategoryBadge categoryId={category.id} />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!category.isCustom}
                      aria-label={`Editar categoría ${category.label}`}
                      onClick={() => {
                        startEditingCustomCategory(category.id)
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!category.isCustom}
                      aria-label={`Eliminar categoría ${category.label}`}
                      onClick={() => void handleDeleteCustomCategory(category.id)}
                    >
                      <Trash size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Transacciones</span>
                    <span className="font-mono">
                      {getCategoryTransactionCount(category.id)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-mono">
                      $U {getCategoryAmountTotal(category.id).toLocaleString(
                        'es-UY',
                        { minimumFractionDigits: 2 }
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Confianza promedio</span>
                    <span className="font-mono">87%</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <h3>Configuración</h3>

          <Card className="p-6">
            <h4 className="mb-4">Persistencia de Datos</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Guardar localmente</p>
                  <p className="text-sm text-muted-foreground">
                    Los datos se guardan en tu navegador
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Sincronizar con Firebase</p>
                  <p className="text-sm text-muted-foreground">
                    Opcional: respaldo en la nube
                  </p>
                </div>
                <Switch />
              </div>

              <Card className="p-4 bg-warning-50 dark:bg-warning-900/10 border-warning/20">
                <p className="text-sm">
                  <strong>Privacidad:</strong> Tatú está diseñado para mantener tus datos locales. 
                  No recolectamos información personal identificable ni datos financieros sensibles.
                </p>
              </Card>
            </div>
          </Card>

          <Card className="p-6">
            <h4 className="mb-4">Automatización</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Categorización automática</p>
                  <p className="text-sm text-muted-foreground">
                    Aprender de tus correcciones manuales
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Detectar duplicados</p>
                  <p className="text-sm text-muted-foreground">
                    Alertar sobre transacciones repetidas
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h4 className="mb-4">Reglas de Categorización</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Creá reglas personalizadas para categorizar transacciones automáticamente.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
                <div>
                  <label htmlFor="tools-pattern-text" className="block text-sm mb-2">
                    Patrón
                  </label>
                  <Input
                    id="tools-pattern-text"
                    value={patternForm.pattern}
                    onChange={(e) => setPatternForm(prev => ({ ...prev, pattern: e.target.value }))}
                    placeholder='Ej. "farmacia"'
                  />
                </div>
                <div>
                  <label htmlFor="tools-pattern-match" className="block text-sm mb-2">
                    Tipo
                  </label>
                  <select
                    id="tools-pattern-match"
                    value={patternForm.matchType}
                    onChange={(e) => setPatternForm(prev => ({ ...prev, matchType: e.target.value as MatchType }))}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-input-background h-10"
                  >
                    <option value="contains">Contiene</option>
                    <option value="starts_with">Empieza con</option>
                    <option value="exact">Exacto</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="tools-pattern-category" className="block text-sm mb-2">
                    Categoría
                  </label>
                  <select
                    id="tools-pattern-category"
                    value={patternForm.category}
                    onChange={(e) => setPatternForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-input-background h-10"
                  >
                    {Object.values(Category)
                      .filter(c => c !== Category.Uncategorized)
                      .map(cat => (
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
                >
                  <Plus size={18} />
                </Button>
              </div>

              {customPatterns.length > 0 && (
                <div className="space-y-2">
                  {customPatterns.map(cp => {
                    const catDisplay = getCategoryDisplay(cp.category);
                    const matchLabel =
                      cp.matchType === 'contains'
                        ? 'contiene'
                        : cp.matchType === 'starts_with'
                          ? 'empieza con'
                          : 'exacto';
                    return (
                      <div
                        key={cp.id}
                        className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <Badge variant="outline">{matchLabel}</Badge>
                          <span className="font-mono truncate">&quot;{cp.pattern}&quot;</span>
                          <span className="text-muted-foreground">&rarr;</span>
                          <Badge style={{ backgroundColor: catDisplay.color + '20', color: catDisplay.color }}>
                            {catDisplay.icon} {catDisplay.label}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePattern(cp.id)}
                          aria-label={`Eliminar regla ${cp.pattern}`}
                        >
                          <Trash size={14} className="text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {customPatterns.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay reglas personalizadas. Creá una para categorizar
                  automáticamente transacciones que contengan un patrón.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h4 className="mb-4">Formatos Regionales</h4>
            <div className="space-y-4">
              <div>
                <label htmlFor="tools-date-format" className="block text-sm mb-2">
                  Formato de fecha
                </label>
                <select
                  id="tools-date-format"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-input-background"
                >
                  <option>DD/MM/YYYY (Uruguay)</option>
                  <option>MM/DD/YYYY (USA)</option>
                  <option>YYYY-MM-DD (ISO)</option>
                </select>
              </div>

              <div>
                <label htmlFor="tools-decimal-separator" className="block text-sm mb-2">
                  Separador decimal
                </label>
                <select
                  id="tools-decimal-separator"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-input-background"
                >
                  <option>Coma (1.234,56)</option>
                  <option>Punto (1,234.56)</option>
                </select>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-destructive/30 bg-destructive/5">
            <h4 className="mb-3">Reset de datos</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Elimina todas las transacciones, categorías y reglas guardadas.
            </p>
            <Button
              variant="destructive"
              onClick={() => void handleResetAllData()}
              disabled={!onResetAllData}
            >
              Resetear todos los datos
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
