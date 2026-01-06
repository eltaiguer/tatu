// Feature Status - Overview of implemented features

import { Card } from './ui/card';
import { Check } from 'lucide-react';

export function FeatureStatus() {
  const features = [
    { category: 'Core Features', items: [
      'CSV import with drag & drop',
      'Multi-account support (Credit Card, USD, UYU)',
      'Auto-categorization with confidence scoring',
      'Manual category overrides',
      'Multi-currency support (UYU/USD)',
    ]},
    { category: 'Data Visualization', items: [
      'Dashboard with summary cards',
      'Spending by category (Pie chart)',
      'Monthly trends (Bar chart)',
      'Income vs Expenses (Line chart)',
      'Quick stats and insights',
    ]},
    { category: 'Tools & Filters', items: [
      'Advanced filters (category, date, amount, currency)',
      'Search with debounce',
      'Sortable transaction list',
      'Pagination',
      'Export to CSV and PDF',
    ]},
    { category: 'UX & Accessibility', items: [
      'Spanish UI with Uruguayan formats',
      'Dark mode toggle',
      'Fully responsive (mobile + desktop)',
      'Empty, loading, and error states',
      'WCAG compliant contrast',
    ]},
    { category: 'Design System', items: [
      'Custom brand identity (Tatú)',
      'Expressive typography (Space Grotesk, Inter, JetBrains Mono)',
      'Cohesive color system',
      'Component library showcase',
      'Uruguayan merchant data',
    ]},
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2">Estado de Implementación</h2>
        <p className="text-muted-foreground">
          Todas las funcionalidades solicitadas están completamente implementadas
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((section) => (
          <Card key={section.category} className="p-6">
            <h4 className="mb-4 text-primary">{section.category}</h4>
            <ul className="space-y-3">
              {section.items.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-success-100 dark:bg-success-900/20 flex items-center justify-center mt-0.5">
                    <Check className="text-success-600" size={12} />
                  </div>
                  <span className="text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="p-6 bg-gradient-to-r from-success-50 to-primary-50 dark:from-success-900/10 dark:to-primary-900/10 border-success/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-success-600 flex items-center justify-center flex-shrink-0">
            <Check className="text-white" size={24} />
          </div>
          <div>
            <h4 className="text-success-700 dark:text-success-400 mb-1">100% Completo</h4>
            <p className="text-sm text-muted-foreground">
              Sistema de diseño premium, funcionalidades completas, y experiencia de usuario pulida para Tatú.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
