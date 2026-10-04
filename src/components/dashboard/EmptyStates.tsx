// Resumen's two non-data states: nothing imported yet, and everything
// imported falls in ignored categories.

import { Upload, EyeOff } from 'lucide-react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'

export function NoTransactionsState({
  onNavigateToImport,
}: {
  onNavigateToImport?: () => void
}) {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Upload className="text-primary" size={28} />
      </div>
      <div>
        <h2 className="mb-2">Empezá importando tu extracto</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Arrastrá tu archivo CSV de Santander Uruguay para ver tu dashboard con
          ingresos, gastos y estadísticas.
        </p>
      </div>
      {onNavigateToImport && (
        <Button size="lg" onClick={onNavigateToImport}>
          <Upload size={18} className="mr-2" />
          Importar extracto CSV
        </Button>
      )}
    </Card>
  )
}

// Data exists but every row is ignored — a zeroed dashboard would look like
// a bug, so say why instead of rendering empty cards.
export function AllIgnoredState({
  transactionCount,
  onNavigateToCategories,
}: {
  transactionCount: number
  onNavigateToCategories?: () => void
}) {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <EyeOff className="text-primary" size={28} />
      </div>
      <div>
        <h2 className="mb-2">Todas tus transacciones están ignoradas</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Importaste {transactionCount}{' '}
          {transactionCount === 1 ? 'transacción' : 'transacciones'}, pero todas
          caen en categorías ignoradas (transferencias u otras que marcaste),
          así que no suman a ningún total. Cambiales la categoría o desmarcá
          “ignorar” para verlas acá.
        </p>
      </div>
      {onNavigateToCategories && (
        <Button size="lg" variant="outline" onClick={onNavigateToCategories}>
          Revisar categorías
        </Button>
      )}
    </Card>
  )
}
