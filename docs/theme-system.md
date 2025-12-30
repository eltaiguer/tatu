# Theme System

The Tatu theme system provides semantic tokens that automatically adapt to light and dark modes, implemented using CSS custom properties and integrated with Tailwind CSS v3.

## Overview

Semantic tokens are theme-aware colors that change based on the current mode (light or dark). Instead of hardcoding specific colors, use semantic tokens that automatically adjust for optimal contrast and readability.

## Semantic Tokens

### Background & Foreground

```css
--background: /* Page background */
--foreground: /* Primary text color */
```

**Usage:**
```tsx
<div className="bg-background text-foreground">
  Content with theme-aware colors
</div>
```

### Card

```css
--card: /* Card background */
--card-foreground: /* Card text color */
```

**Usage:**
```tsx
<div className="bg-card text-card-foreground rounded-lg p-6">
  Card content
</div>
```

### Popover

```css
--popover: /* Popover/dropdown background */
--popover-foreground: /* Popover text color */
```

**Usage:**
```tsx
<div className="bg-popover text-popover-foreground shadow-lg rounded-md">
  Dropdown menu
</div>
```

### Primary

```css
--primary: /* Primary brand color */
--primary-foreground: /* Text on primary background */
```

**Usage:**
```tsx
<button className="bg-primary text-primary-foreground">
  Primary Action
</button>
```

### Secondary

```css
--secondary: /* Secondary background */
--secondary-foreground: /* Secondary text color */
```

**Usage:**
```tsx
<button className="bg-secondary text-secondary-foreground">
  Secondary Action
</button>
```

### Muted

```css
--muted: /* Muted background */
--muted-foreground: /* Muted text color */
```

**Usage:**
```tsx
<div className="bg-muted">
  <p className="text-muted-foreground">Less prominent text</p>
</div>
```

### Accent

```css
--accent: /* Accent color */
--accent-foreground: /* Text on accent background */
```

**Usage:**
```tsx
<div className="bg-accent text-accent-foreground">
  Featured content
</div>
```

### Destructive

```css
--destructive: /* Destructive/error color */
--destructive-foreground: /* Text on destructive background */
```

**Usage:**
```tsx
<button className="bg-destructive text-destructive-foreground">
  Delete
</button>
```

### Form Elements

```css
--border: /* Border color */
--input: /* Input border color */
--ring: /* Focus ring color */
```

**Usage:**
```tsx
<input
  className="border-border focus:ring-ring"
  type="text"
/>
```

## Light Mode Values

```css
:root {
  --background: #f8fafc;           /* neutral-50 */
  --foreground: #0f172a;           /* neutral-900 */
  --card: #ffffff;
  --card-foreground: #0f172a;
  --primary: #0066ce;              /* primary-600 */
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;            /* neutral-100 */
  --muted: #f1f5f9;
  --muted-foreground: #64748b;     /* neutral-500 */
  --accent: #eb6f47;               /* accent-500 */
  --destructive: #dc2626;
  --border: #e2e8f0;               /* neutral-200 */
  --input: #e2e8f0;
  --ring: #0066ce;
}
```

## Dark Mode Values

```css
.dark {
  --background: #0f172a;           /* neutral-900 */
  --foreground: #f8fafc;           /* neutral-50 */
  --card: #1e293b;                 /* neutral-800 */
  --card-foreground: #f8fafc;
  --primary: #30a3ff;              /* primary-400 */
  --primary-foreground: #0f172a;
  --secondary: #1e293b;            /* neutral-800 */
  --muted: #1e293b;
  --muted-foreground: #94a3b8;     /* neutral-400 */
  --accent: #f2916d;               /* accent-400 */
  --destructive: #ef4444;
  --border: #334155;               /* neutral-700 */
  --input: #334155;
  --ring: #30a3ff;
}
```

## Enabling Dark Mode

Add the `dark` class to a parent element (typically `<html>` or `<body>`):

```tsx
// Toggle dark mode
<html className={isDark ? 'dark' : ''}>
  {/* Content automatically adapts */}
</html>
```

## Common Patterns

### Page Layout
```tsx
<div className="min-h-screen bg-background text-foreground">
  <main className="container mx-auto">
    {/* Content */}
  </main>
</div>
```

### Cards
```tsx
<div className="bg-card text-card-foreground rounded-lg shadow-md p-6">
  <h2>Card Title</h2>
  <p className="text-muted-foreground">Card description</p>
</div>
```

### Buttons
```tsx
{/* Primary */}
<button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Primary
</button>

{/* Secondary */}
<button className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
  Secondary
</button>

{/* Destructive */}
<button className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
  Delete
</button>
```

### Forms
```tsx
<input
  className="
    border border-input
    bg-background
    text-foreground
    focus:ring-2 focus:ring-ring
    rounded-md px-3 py-2
  "
  type="text"
/>
```

### Dropdowns/Popovers
```tsx
<div className="bg-popover text-popover-foreground border border-border shadow-lg rounded-md">
  <div className="p-2">
    <button className="w-full text-left px-2 py-1 hover:bg-accent hover:text-accent-foreground rounded">
      Menu Item
    </button>
  </div>
</div>
```

## Benefits of Semantic Tokens

1. **Automatic Dark Mode**: Components adapt without code changes
2. **Consistent Theming**: All components use the same color system
3. **Easy Customization**: Change theme by updating token values
4. **Better Accessibility**: Ensures proper contrast in both modes
5. **Future-Proof**: Easy to add more themes (e.g., high contrast)

## Migration from Direct Colors

**Before:**
```tsx
<div className="bg-gray-50 text-gray-900">
  <div className="bg-white border-gray-200">
    {/* Hard to make dark mode compatible */}
  </div>
</div>
```

**After:**
```tsx
<div className="bg-background text-foreground">
  <div className="bg-card border-border">
    {/* Automatically works in dark mode */}
  </div>
</div>
```

## Tailwind Integration

All semantic tokens are available as Tailwind utilities:

```tsx
className="bg-background text-foreground"
className="bg-card text-card-foreground"
className="bg-primary text-primary-foreground"
className="border-border focus:ring-ring"
```

## CSS Custom Properties

Tokens are also available as CSS custom properties:

```css
.custom-component {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
}

.custom-component:focus {
  outline: 2px solid var(--ring);
}
```

## Implementation Files

- [src/styles/theme.css](../src/styles/theme.css) - Semantic token definitions
- [tailwind.config.js](../tailwind.config.js) - Tailwind theme extension
- [src/index.css](../src/index.css) - System imports

## Testing

All theme tokens are tested in [src/styles/theme.test.ts](../src/styles/theme.test.ts) for both light and dark modes.

## Related Design Tokens

- [Color System](./color-system.md) - Base color palettes
- [Spacing System](./spacing-system.md) - 4px-based spacing scale
- [Layout System](./layout-system.md) - Border radius and shadows
- [Typography System](./typography-system.md) - Fonts and text styles
