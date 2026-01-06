// Loading State - Skeleton loaders for better UX

import { Card } from './ui/card';
import { Loader } from 'lucide-react';

interface LoadingStateProps {
  type?: 'dashboard' | 'transactions' | 'charts' | 'default';
}

export function LoadingState({ type = 'default' }: LoadingStateProps) {
  if (type === 'default') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader className="animate-spin text-primary mx-auto mb-4" size={48} />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (type === 'dashboard') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-12 bg-muted rounded mb-3" />
              <div className="h-8 bg-muted rounded w-2/3" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-32 bg-muted rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'transactions') {
    return (
      <Card className="p-6 animate-pulse">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-12 w-12 bg-muted rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
              <div className="h-6 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (type === 'charts') {
    return (
      <div className="space-y-6">
        <Card className="p-6 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6" />
          <div className="h-[400px] bg-muted rounded" />
        </Card>
        <Card className="p-6 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6" />
          <div className="h-[400px] bg-muted rounded" />
        </Card>
      </div>
    );
  }

  return null;
}
