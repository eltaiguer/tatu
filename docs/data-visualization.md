# Data Visualization Colors

The Tatu data visualization system provides specialized color palettes for charts and transaction categories, with full light/dark mode support.

## Chart Colors

A 6-color palette optimized for data visualization with distinct, accessible colors.

### Light Mode Chart Colors

```css
--chart-1: #0684f1;  /* Ocean blue (primary-500) */
--chart-2: #eb6f47;  /* Terracotta (accent-500) */
--chart-3: #22c55e;  /* Mate green (success-500) */
--chart-4: #f59e0b;  /* Amber (warning-500) */
--chart-5: #8b5cf6;  /* Purple */
--chart-6: #ec4899;  /* Pink */
```

### Dark Mode Chart Colors

```css
--chart-1: #30a3ff;  /* Lighter ocean blue (primary-400) */
--chart-2: #f2916d;  /* Lighter terracotta (accent-400) */
--chart-3: #4ade80;  /* Lighter mate green (success-400) */
--chart-4: #fbbf24;  /* Lighter amber (warning-400) */
--chart-5: #a78bfa;  /* Lighter purple */
--chart-6: #f472b6;  /* Lighter pink */
```

### Usage Examples

**Tailwind Classes:**
```tsx
<div className="bg-chart-1">Chart 1 segment</div>
<div className="bg-chart-2">Chart 2 segment</div>
<div className="text-chart-3">Chart 3 label</div>
```

**CSS Custom Properties:**
```css
.pie-segment-1 {
  fill: var(--chart-1);
}

.bar-chart-2 {
  background: var(--chart-2);
}
```

**With Chart Libraries:**
```tsx
// Recharts example
const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]

<PieChart>
  {data.map((entry, index) => (
    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
  ))}
</PieChart>
```

## Category Colors

Transaction category colors that match your application's color system.

### Categories

```css
/* Food & Dining */
--category-food: #eb6f47 (light) / #f2916d (dark)

/* Transportation */
--category-transport: #0684f1 (light) / #30a3ff (dark)

/* Utilities */
--category-utilities: #f59e0b (light) / #fbbf24 (dark)

/* Entertainment */
--category-entertainment: #8b5cf6 (light) / #a78bfa (dark)

/* Shopping */
--category-shopping: #ec4899 (light) / #f472b6 (dark)

/* Health & Wellness */
--category-health: #22c55e (light) / #4ade80 (dark)

/* Education */
--category-education: #06b6d4 (light) / #22d3ee (dark)

/* Income */
--category-income: #16a34a (light) / #4ade80 (dark)

/* Other/Uncategorized */
--category-other: #94a3b8 (light) / #64748b (dark)
```

### Usage Examples

**Tailwind Classes:**
```tsx
<div className="bg-category-food text-white">
  Food
</div>

<div className="border-l-4 border-category-transport">
  Transport transaction
</div>
```

**Category Badges:**
```tsx
const CategoryBadge = ({ category }: { category: string }) => (
  <span
    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
    style={{ backgroundColor: `var(--category-${category})`, color: 'white' }}
  >
    {category}
  </span>
)
```

**Category Icons:**
```tsx
const CategoryIcon = ({ category }: { category: string }) => (
  <div
    className="w-8 h-8 rounded-full flex items-center justify-center"
    style={{ backgroundColor: `var(--category-${category})` }}
  >
    <Icon name={category} className="text-white" />
  </div>
)
```

**Legend:**
```tsx
const categories = [
  'food',
  'transport',
  'utilities',
  'entertainment',
  'shopping',
  'health',
  'education',
  'income',
  'other',
]

<div className="flex flex-wrap gap-2">
  {categories.map((cat) => (
    <div key={cat} className="flex items-center gap-2">
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: `var(--category-${cat})` }}
      />
      <span className="text-sm capitalize">{cat}</span>
    </div>
  ))}
</div>
```

## Accessibility Guidelines

### Contrast Requirements

- Ensure text on colored backgrounds meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Use white text on darker category colors
- Use dark text on lighter category colors (50-200 shades)

### Color Blindness Considerations

The palette is designed to be distinguishable for common types of color blindness:
- Ocean blue and terracotta provide good contrast
- Green and purple/pink are distinguishable
- Avoid relying solely on color - use labels, patterns, or icons

### Testing Dark Mode

Always test charts and categories in both light and dark modes:
```tsx
// Toggle between modes for testing
<html className={isDark ? 'dark' : ''}>
```

## Chart Library Integration

### Recharts
```tsx
import { PieChart, Pie, Cell } from 'recharts'

const COLORS = Array.from({ length: 6 }, (_, i) => `var(--chart-${i + 1})`)

<PieChart>
  <Pie data={data} dataKey="value">
    {data.map((entry, index) => (
      <Cell key={index} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
</PieChart>
```

### Chart.js
```tsx
const chartData = {
  datasets: [{
    data: [10, 20, 30],
    backgroundColor: [
      getComputedStyle(document.documentElement).getPropertyValue('--chart-1'),
      getComputedStyle(document.documentElement).getPropertyValue('--chart-2'),
      getComputedStyle(document.documentElement).getPropertyValue('--chart-3'),
    ]
  }]
}
```

## Implementation Files

- [src/styles/chart-colors.css](../src/styles/chart-colors.css) - Chart color definitions
- [src/styles/category-colors.css](../src/styles/category-colors.css) - Category color definitions
- [tailwind.config.js](../tailwind.config.js) - Tailwind theme extension
- [src/index.css](../src/index.css) - System imports

## Testing

- Chart colors: [src/styles/chart-colors.test.ts](../src/styles/chart-colors.test.ts)
- Category colors: [src/styles/category-colors.test.ts](../src/styles/category-colors.test.ts)

## Related Design Tokens

- [Color System](./color-system.md) - Base color palettes
- [Theme System](./theme-system.md) - Semantic tokens and dark mode
- [Spacing System](./spacing-system.md) - Layout spacing
- [Layout System](./layout-system.md) - Border radius and shadows
