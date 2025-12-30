# Layout System

The Tatu layout system provides border radius and shadow tokens for consistent elevation and corner rounding, implemented using CSS custom properties and integrated with Tailwind CSS v3.

## Border Radius

Consistent border radius scale for rounded corners:

```css
--radius-xs: 0.25rem;   /* 4px - Small elements */
--radius-sm: 0.375rem;  /* 6px - Inputs, small buttons */
--radius-md: 0.5rem;    /* 8px - Default buttons */
--radius-lg: 0.75rem;   /* 12px - Cards */
--radius-xl: 1rem;      /* 16px - Large cards */
--radius-2xl: 1.5rem;   /* 24px - Modals */
--radius-full: 9999px;  /* Pills, avatars */
```

### Usage

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

### Common Patterns

**Buttons:**
```tsx
<button className="rounded-md">Primary Button</button>
<button className="rounded-sm">Secondary Button</button>
```

**Cards:**
```tsx
<div className="rounded-lg">Standard Card</div>
<div className="rounded-xl">Large Card</div>
<div className="rounded-2xl">Modal</div>
```

**Inputs:**
```tsx
<input className="rounded-sm" />
<textarea className="rounded-md" />
```

**Badges/Pills:**
```tsx
<span className="rounded-full">Badge</span>
<div className="rounded-full">Avatar</div>
```

## Shadows

Elevation system using box shadows:

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);           /* Subtle lift */
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);         /* Default cards */
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);       /* Elevated cards */
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);       /* Modals */
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);    /* Maximum depth */
```

### Usage

```tsx
<div className="shadow-sm">       {/* Subtle shadow */}
  Low elevation
</div>

<div className="shadow-md">       {/* Medium shadow */}
  Default card
</div>

<div className="shadow-lg">       {/* Prominent shadow */}
  High elevation
</div>
```

### Common Patterns

**Cards:**
```tsx
<div className="shadow-sm hover:shadow-md transition-shadow">
  Hoverable card with subtle shadow
</div>

<div className="shadow-md">
  Standard card elevation
</div>
```

**Modals/Popovers:**
```tsx
<div className="shadow-xl">
  Modal with strong elevation
</div>

<div className="shadow-2xl">
  Overlay with maximum depth
</div>
```

**Dropdowns:**
```tsx
<div className="shadow-lg">
  Dropdown menu
</div>
```

**Interactive States:**
```tsx
<button className="shadow-sm hover:shadow-md active:shadow-sm transition-shadow">
  Button with shadow feedback
</button>
```

## Tailwind Integration

All layout tokens are available as Tailwind utilities:

```tsx
// Border Radius
className="rounded-xs rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-full"

// Shadows
className="shadow-sm shadow-md shadow-lg shadow-xl shadow-2xl"

// Combining with hover states
className="shadow-sm hover:shadow-lg transition-shadow"
```

## CSS Custom Properties

All tokens are also available as CSS custom properties:

```css
.custom-card {
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.custom-modal {
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}
```

## Design Guidelines

### Border Radius Selection

- **xs (4px)**: Very small elements, tight corners
- **sm (6px)**: Inputs, small buttons, compact UI
- **md (8px)**: Default buttons, standard elements
- **lg (12px)**: Cards, panels, containers
- **xl (16px)**: Large cards, feature sections
- **2xl (24px)**: Modals, dialogs, overlays
- **full (9999px)**: Circular elements, pills, avatars

### Shadow Selection

- **sm**: Subtle lift for low-priority elements
- **md**: Default elevation for cards and containers
- **lg**: Emphasized elements, dropdown menus
- **xl**: Modals, popovers, prominent overlays
- **2xl**: Maximum depth, critical overlays

## Implementation Files

- [src/styles/layout.css](../src/styles/layout.css) - CSS custom properties
- [tailwind.config.js](../tailwind.config.js) - Tailwind theme extension
- [src/index.css](../src/index.css) - System imports

## Testing

All layout tokens are tested in [src/styles/layout.test.ts](../src/styles/layout.test.ts) to ensure proper definition and availability.

## Related Design Tokens

- [Color System](./color-system.md) - Color palettes
- [Spacing System](./spacing-system.md) - 4px-based spacing scale
- [Typography System](./typography-system.md) - Fonts and text styles
