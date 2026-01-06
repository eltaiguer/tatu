// Tools - Filters, Export, Category Management

import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { CategoryBadge } from './CategoryBadge';
import { ListFilter, Download, Plus, Pencil, Trash, FileText, Settings } from 'lucide-react';
import type { Transaction } from '../models';
import { categories } from '../utils/figma-data';
import { useState } from 'react';


interface ToolsProps {
  transactions: Transaction[];
}

export function Tools({ transactions }: ToolsProps) {
  const [activeTab, setActiveTab] = useState<'filters' | 'export' | 'categories' | 'settings'>('filters');

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
                <label className="block text-sm mb-2">Desde</label>
                <Input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Hasta</label>
                <Input
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
                <label className="block text-sm mb-2">Mínimo</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amountRange.min}
                  onChange={(e) => setAmountRange(prev => ({ ...prev, min: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm mb-2">Máximo</label>
                <Input
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
                  <label className="block text-sm mb-2">Fecha inicial</label>
                  <Input type="date" defaultValue="2024-01-01" />
                </div>
                <div>
                  <label className="block text-sm mb-2">Fecha final</label>
                  <Input type="date" defaultValue="2024-12-29" />
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
            <Button>
              <Plus size={18} className="mr-2" />
              Nueva Categoría
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map(category => (
              <Card key={category.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <CategoryBadge categoryId={category.id} />
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm">
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Trash size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Transacciones</span>
                    <span className="font-mono">
                      {transactions.filter(t => t.category === category.id).length}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-mono">
                      $U {Math.abs(
                        transactions
                          .filter(t => t.category === category.id && t.amount < 0)
                          .reduce((sum, t) => sum + t.amount, 0)
                      ).toLocaleString('es-UY', { minimumFractionDigits: 2 })}
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
            <h4 className="mb-4">Formatos Regionales</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Formato de fecha</label>
                <select className="w-full px-3 py-2 rounded-lg border border-input bg-input-background">
                  <option>DD/MM/YYYY (Uruguay)</option>
                  <option>MM/DD/YYYY (USA)</option>
                  <option>YYYY-MM-DD (ISO)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Separador decimal</label>
                <select className="w-full px-3 py-2 rounded-lg border border-input bg-input-background">
                  <option>Coma (1.234,56)</option>
                  <option>Punto (1,234.56)</option>
                </select>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
