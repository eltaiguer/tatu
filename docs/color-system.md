# Color System

The Tatu color system is inspired by Uruguayan fintech aesthetics and the Río de la Plata, implemented using CSS custom properties and integrated with Tailwind CSS v3.

## Color Palettes

### Primary - Ocean Blue
Deep ocean blue with warmth, representing trust and professionalism.

```css
--primary-50: #f0f7ff;   /* Lightest */
--primary-100: #dfeeff;
--primary-200: #b8ddff;
--primary-300: #78c2ff;
--primary-400: #30a3ff;
--primary-500: #0684f1;  /* Base */
--primary-600: #0066ce;  /* Main brand color */
--primary-700: #0052a7;
--primary-800: #03448a;
--primary-900: #093a72;  /* Darkest */
```

**Usage:**
```tsx
<button className="bg-primary-600 hover:bg-primary-700 text-white">
  Primary Action
</button>
```

### Accent - Sunset Terracotta
Warm terracotta inspired by Uruguayan sunsets over the Rio.

```css
--accent-50: #fef7f3;
--accent-100: #fdede5;
--accent-200: #fbd8ca;
--accent-300: #f7baa4;
--accent-400: #f2916d;
--accent-500: #eb6f47;   /* Base */
--accent-600: #d95429;   /* Main accent color */
--accent-700: #b5421f;
--accent-800: #943a1e;
--accent-900: #79331e;
```

**Usage:**
```tsx
<div className="bg-accent-50 border-accent-200">
  <span className="text-accent-600">Featured</span>
</div>
```

### Success - Mate Green
Fresh green inspired by mate, representing positive outcomes.

```css
--success-50: #f0fdf5;
--success-100: #dcfce8;
--success-200: #bbf7d1;
--success-300: #86efac;
--success-400: #4ade80;
--success-500: #22c55e;  /* Base */
--success-600: #16a34a;
--success-700: #15803d;
--success-800: #166534;
--success-900: #14532d;
```

**Usage:**
```tsx
<div className="bg-success-100 text-success-700 border border-success-200">
  Transaction successful
</div>
```

### Warning - Amber
Warm amber for alerts and important notices.

```css
--warning-50: #fffbeb;
--warning-100: #fef3c7;
--warning-200: #fde68a;
--warning-300: #fcd34d;
--warning-400: #fbbf24;
--warning-500: #f59e0b;  /* Base */
--warning-600: #d97706;
--warning-700: #b45309;
--warning-800: #92400e;
--warning-900: #78350f;
```

**Usage:**
```tsx
<div className="bg-warning-100 text-warning-800 border border-warning-300">
  Warning: Please verify your information
</div>
```

### Neutral - Cool Grays
Cool gray scale for text and backgrounds.

```css
--neutral-50: #f8fafc;   /* Lightest background */
--neutral-100: #f1f5f9;
--neutral-200: #e2e8f0;  /* Borders */
--neutral-300: #cbd5e1;
--neutral-400: #94a3b8;  /* Muted text */
--neutral-500: #64748b;  /* Secondary text */
--neutral-600: #475569;
--neutral-700: #334155;
--neutral-800: #1e293b;  /* Primary text */
--neutral-900: #0f172a;  /* Darkest */
```

**Usage:**
```tsx
<div className="bg-neutral-50 border border-neutral-200">
  <p className="text-neutral-900">Primary text</p>
  <p className="text-neutral-500">Secondary text</p>
</div>
```

## Spacing System

Based on a 4px unit (0.25rem) for consistent spacing throughout the application.

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

**Usage:**
```tsx
<div className="p-4 gap-3">      {/* 16px padding, 12px gap */}
  <div className="mb-6">         {/* 24px bottom margin */}
    <div className="space-y-2">  {/* 8px vertical spacing */}
      ...
    </div>
  </div>
</div>
```

## Border Radius

Consistent border radius scale for rounded corners.

```css
--radius-xs: 0.25rem;   /* 4px - Small elements */
--radius-sm: 0.375rem;  /* 6px - Inputs, small buttons */
--radius-md: 0.5rem;    /* 8px - Default buttons */
--radius-lg: 0.75rem;   /* 12px - Cards */
--radius-xl: 1rem;      /* 16px - Large cards */
--radius-2xl: 1.5rem;   /* 24px - Modals */
--radius-full: 9999px;  /* Pills, avatars */
```

**Usage:**
```tsx
<button className="rounded-md">    {/* 8px radius */}
  Default Button
</button>

<div className="rounded-lg">      {/* 12px radius */}
  Card content
</div>

<span className="rounded-full">   {/* Fully rounded */}
  Badge
</span>
```

## Shadows

Elevation system using box shadows.

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);           /* Subtle lift */
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);         /* Default cards */
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);       /* Elevated cards */
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);       /* Modals */
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);    /* Maximum depth */
```

**Usage:**
```tsx
<div className="shadow-sm">       {/* Subtle shadow */}
  Low elevation
</div>

<div className="shadow-lg">       {/* Prominent shadow */}
  High elevation
</div>
```

## Tailwind Integration

All color tokens, spacing, border radius, and shadows are available as Tailwind utilities:

```tsx
// Colors
className="bg-primary-600 text-white"
className="border border-neutral-200"
className="text-success-700"

// Spacing
className="p-4 mt-6 gap-3"
className="space-y-4"

// Border Radius
className="rounded-lg"
className="rounded-full"

// Shadows
className="shadow-md"
className="hover:shadow-lg"
```

## CSS Custom Properties

All tokens are also available as CSS custom properties for use in custom styles:

```css
.custom-element {
  background: var(--primary-600);
  color: var(--neutral-50);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
```

## Dark Mode

The color system is designed to work with Tailwind's dark mode. When implementing dark mode variants, use appropriate color weights:

```tsx
<div className="bg-white dark:bg-neutral-800">
  <p className="text-neutral-900 dark:text-neutral-100">
    Readable in both modes
  </p>
</div>
```

**Guidelines:**
- Light mode: Use 600-900 weights for text on light backgrounds
- Dark mode: Use 50-400 weights for text on dark backgrounds
- Maintain WCAG AA contrast ratios (4.5:1 for text, 3:1 for UI elements)

## Implementation Files

- [src/styles/colors.css](../src/styles/colors.css) - CSS custom properties
- [tailwind.config.js](../tailwind.config.js) - Tailwind theme extension
- [src/index.css](../src/index.css) - System imports

## Testing

All color tokens are tested in [src/styles/colors.test.ts](../src/styles/colors.test.ts) to ensure proper definition and availability.
