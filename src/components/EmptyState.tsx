// Empty State Component - Friendly empty state messages

import { Card } from './ui/card';
import { Button } from './ui/button';
import { Upload, ChartPie, ListFilter } from 'lucide-react';

interface EmptyStateProps {
  type: 'transactions' | 'charts' | 'filters';
  onAction?: () => void;
}

export function EmptyState({ type, onAction }: EmptyStateProps) {
  const content = {
    transactions: {
      icon: Upload,
      title: 'No hay transacciones todavía',
      description: 'Importá tu primer extracto CSV de Santander Uruguay para comenzar a gestionar tus gastos.',
      actionLabel: 'Importar CSV',
    },
    charts: {
      icon: ChartPie,
      title: 'No hay suficientes datos',
      description: 'Necesitás al menos algunas transacciones para generar gráficos e insights.',
      actionLabel: 'Ver transacciones',
    },
    filters: {
      icon: ListFilter,
      title: 'No se encontraron resultados',
      description: 'Probá ajustar los filtros o buscar con otros términos.',
      actionLabel: 'Limpiar filtros',
    },
  };

  const { icon: Icon, title, description, actionLabel } = content[type];

  return (
    <Card className="p-12 border-dashed">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <Icon className="text-muted-foreground" size={48} />
        </div>
        <h3 className="mb-2">{title}</h3>
        <p className="text-muted-foreground mb-6">{description}</p>
        {onAction && (
          <Button onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
