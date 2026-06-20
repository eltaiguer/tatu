import type { ReactNode } from 'react'
import { cn } from './utils'

interface IconTileProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  color?: string
  bg?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<string, { px: number; radius: number; font: number }> = {
  sm: { px: 30, radius: 8, font: 16 },
  md: { px: 34, radius: 9, font: 18 },
  lg: { px: 36, radius: 10, font: 20 },
}

export function IconTile({
  children,
  color,
  bg,
  size = 'md',
  className,
  style,
  ...rest
}: IconTileProps) {
  const { px, radius, font } = SIZE[size]
  const background = bg ?? (color ? `${color}1f` : 'var(--surface-2)')
  return (
    <span
      className={cn(className)}
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        background,
        color: color ?? undefined,
        display: 'grid',
        placeItems: 'center',
        fontSize: font,
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
