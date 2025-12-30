# Spacing System

The Tatu spacing system uses a 4px base unit for consistent spacing throughout the application, implemented using CSS custom properties and integrated with Tailwind CSS v3.

## Spacing Scale

Based on a 4px unit (0.25rem) for consistent spacing:

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
```

## Usage Guidelines

### Padding
```tsx
<div className="p-4">         {/* 16px padding all sides */}
<div className="px-6 py-3">   {/* 24px horizontal, 12px vertical */}
<div className="pt-8 pb-12">  {/* 32px top, 48px bottom */}
```

### Margin
```tsx
<div className="m-4">         {/* 16px margin all sides */}
<div className="mb-6">        {/* 24px bottom margin */}
<div className="mt-8 mx-auto"> {/* 32px top, auto horizontal */}
```

### Gap (Flexbox/Grid)
```tsx
<div className="flex gap-3">      {/* 12px gap between items */}
<div className="grid gap-4">      {/* 16px gap */}
<div className="space-y-2">       {/* 8px vertical spacing */}
```

## Common Patterns

### Card Spacing
```tsx
<div className="p-6 space-y-4">
  {/* 24px padding, 16px vertical spacing between children */}
</div>
```

### Section Spacing
```tsx
<section className="py-12">
  {/* 48px vertical padding for sections */}
</section>
```

### Button Spacing
```tsx
<button className="px-4 py-2">
  {/* 16px horizontal, 8px vertical */}
</button>
```

### List Item Spacing
```tsx
<ul className="space-y-2">
  {/* 8px between list items */}
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

## Tailwind Integration

All spacing tokens are available as Tailwind utilities for padding, margin, gap, and more:

```tsx
// Padding
className="p-4 pt-6 px-8"

// Margin
className="m-4 mt-6 mb-8"

// Gap
className="gap-3 gap-x-4 gap-y-2"

// Space between
className="space-y-4 space-x-3"
```

## CSS Custom Properties

All tokens are also available as CSS custom properties:

```css
.custom-element {
  padding: var(--space-4);
  margin-bottom: var(--space-6);
  gap: var(--space-3);
}
```

## Implementation Files

- [src/styles/spacing.css](../src/styles/spacing.css) - CSS custom properties
- [tailwind.config.js](../tailwind.config.js) - Tailwind theme extension
- [src/index.css](../src/index.css) - System imports

## Testing

All spacing tokens are tested in [src/styles/spacing.test.ts](../src/styles/spacing.test.ts) to ensure proper definition and availability.

## Related Design Tokens

- [Color System](./color-system.md) - Color palettes
- [Layout System](./layout-system.md) - Border radius and shadows
- [Typography System](./typography-system.md) - Fonts and text styles
