# Typography System Documentation

## Overview

The Tatu typography system is adapted from the Figma design system and provides a comprehensive, three-font system optimized for financial data display.

## Font Families

### Primary Font: Inter
**Usage:** Body text, UI components, general content

```tsx
// Default - automatically applied to body
<p>This uses Inter by default</p>

// Explicit usage
<p className="font-sans">This explicitly uses Inter</p>
```

### Display Font: Space Grotesk
**Usage:** Headers, brand moments, hero sections

```tsx
<h1 className="font-display">Tatu Expense Tracker</h1>
<div className="font-display text-4xl font-bold">Welcome Back</div>
```

### Monospace Font: JetBrains Mono
**Usage:** Numbers, amounts, data display, code

```tsx
<span className="font-mono text-lg">$1,234.56</span>
<div className="font-mono">UYU 45,678.90</div>
```

## Typography Scale

| Class | CSS Variable | Size | Pixels | Usage |
|-------|--------------|------|--------|-------|
| `text-xs` | `--text-xs` | 0.75rem | 12px | Small labels, captions |
| `text-sm` | `--text-sm` | 0.875rem | 14px | Secondary text, labels |
| `text-base` | `--text-base` | 1rem | 16px | Body text (default) |
| `text-lg` | `--text-lg` | 1.125rem | 18px | Emphasized text |
| `text-xl` | `--text-xl` | 1.25rem | 20px | Small headings |
| `text-2xl` | `--text-2xl` | 1.5rem | 24px | Section headings |
| `text-3xl` | `--text-3xl` | 1.875rem | 30px | Page headings |
| `text-4xl` | `--text-4xl` | 2.25rem | 36px | Large headings |
| `text-5xl` | `--text-5xl` | 3rem | 48px | Hero text |

## Font Weights

| Class | CSS Variable | Weight | Usage |
|-------|--------------|--------|-------|
| `font-normal` | `--font-weight-normal` | 400 | Body text, regular content |
| `font-medium` | `--font-weight-medium` | 500 | Emphasized text, labels |
| `font-semibold` | `--font-weight-semibold` | 600 | Headings, important text |
| `font-bold` | `--font-weight-bold` | 700 | Strong emphasis |

## Semantic HTML Elements

The typography system automatically styles semantic HTML elements:

### Headings

```tsx
<h1>Page Title</h1>
// 30px, semibold, Space Grotesk, line-height 1.2

<h2>Section Heading</h2>
// 24px, semibold, Space Grotesk, line-height 1.3

<h3>Subsection Heading</h3>
// 20px, semibold, Inter, line-height 1.4

<h4>Minor Heading</h4>
// 18px, medium, Inter, line-height 1.4
```

### Form Elements

```tsx
<label>Field Label</label>
// 14px, medium, line-height 1.5

<button>Action Button</button>
// Inherits size, medium weight
```

## Common Patterns

### Dashboard Cards

```tsx
<div className="rounded-2xl bg-white p-6">
  <h3 className="text-xl font-semibold mb-2">Total Balance</h3>
  <p className="font-mono text-3xl font-bold">$12,345.67</p>
  <p className="text-sm text-gray-500">+5.2% from last month</p>
</div>
```

### Transaction List Item

```tsx
<div className="flex justify-between items-center">
  <div>
    <p className="font-medium">Grocery Store</p>
    <p className="text-sm text-gray-500">Food & Dining</p>
  </div>
  <p className="font-mono font-semibold">-$45.23</p>
</div>
```

### Page Header

```tsx
<header>
  <h1 className="font-display text-4xl font-bold mb-2">Dashboard</h1>
  <p className="text-lg text-gray-600">Track your expenses</p>
</header>
```

### Data Table

```tsx
<table>
  <thead>
    <tr>
      <th className="text-sm font-semibold">Date</th>
      <th className="text-sm font-semibold">Description</th>
      <th className="text-sm font-semibold">Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="font-mono text-sm">2024-01-15</td>
      <td>Coffee Shop</td>
      <td className="font-mono">$4.50</td>
    </tr>
  </tbody>
</table>
```

## Best Practices

### 1. Use Semantic HTML
Prefer semantic HTML elements over divs with classes when possible:

```tsx
// Good
<h2>Section Title</h2>

// Avoid
<div className="text-2xl font-semibold font-display">Section Title</div>
```

### 2. Monospace for Numbers
Always use monospace font for financial amounts and numeric data:

```tsx
// Good
<span className="font-mono">$1,234.56</span>

// Avoid
<span>$1,234.56</span>
```

### 3. Display Font for Brand
Use Space Grotesk sparingly for brand impact:

```tsx
// Good - Logo and main headers
<h1 className="font-display">Tatu</h1>

// Avoid - Body text
<p className="font-display">Regular paragraph text</p>
```

### 4. Consistent Hierarchy
Maintain visual hierarchy with font sizes:

```tsx
// Good - Clear hierarchy
<h2 className="text-2xl font-semibold">Section</h2>
<h3 className="text-xl font-semibold">Subsection</h3>
<p className="text-base">Body text</p>

// Avoid - Confusing hierarchy
<h3 className="text-3xl">Subsection</h3>
<h2 className="text-lg">Section</h2>
```

### 5. Combine Font Utilities
Combine font family, size, and weight for best results:

```tsx
<div className="font-mono text-2xl font-bold">$50,000</div>
<h1 className="font-display text-4xl font-semibold">Welcome</h1>
```

## Dark Mode Support

The typography system is fully compatible with dark mode. Font weights and sizes remain consistent:

```tsx
<p className="text-gray-900 dark:text-gray-100">
  This text adapts to dark mode
</p>
```

## Accessibility

- Minimum font size: 12px (`text-xs`)
- All fonts support Latin character sets
- Line heights optimized for readability (1.2-1.5)
- Font weights meet minimum contrast requirements

## CSS Custom Properties

You can also use CSS custom properties directly:

```css
.custom-heading {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--font-weight-semibold);
}

.amount-display {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-bold);
}
```

## Browser Support

- CSS Custom Properties: All modern browsers (IE11 not supported)
- Google Fonts: Widely supported
- Fallback fonts: System fonts provide excellent coverage

## Performance

- Fonts loaded from Google Fonts CDN (optimized)
- `display=swap` ensures text visible during font loading
- No impact on bundle size (fonts loaded externally)

## Migration Notes

Existing code using Tailwind typography classes (`text-xs`, `font-semibold`, etc.) will automatically use the new typography tokens. No changes required for basic functionality.

To take full advantage of the new fonts:
1. Add `font-display` to brand/header elements
2. Add `font-mono` to numeric/data displays
3. Consider using semantic HTML for automatic styling

## Resources

- [Figma Design System](https://www.figma.com/design/v1sX2UXjNN2rjBN8BPxpAE/High-Fidelity-Product-Design)
- [Inter Font](https://rsms.me/inter/)
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
