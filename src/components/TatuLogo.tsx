interface TatuLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

// Literal class names so Tailwind can see them. Tile: 24 / 34 / 48px;
// wordmark: 18 / 22 / 30px. Keep in sync with `tileSize` below (the svg
// icon is sized from it).
const TILE_SIZE_CLASSES: Record<NonNullable<TatuLogoProps['size']>, string> = {
  sm: 'h-[24px] w-[24px]',
  md: 'h-[34px] w-[34px]',
  lg: 'h-[48px] w-[48px]',
}
const TEXT_SIZE_CLASSES: Record<NonNullable<TatuLogoProps['size']>, string> = {
  sm: 'text-[18px]',
  md: 'text-[22px]',
  lg: 'text-[30px]',
}

export function TatuLogo({ size = 'md', showText = true }: TatuLogoProps) {
  const tileSize = size === 'sm' ? 24 : size === 'lg' ? 48 : 34
  const iconSize = tileSize * 0.65

  return (
    <div className="flex items-center gap-[10px]">
      <span
        className={`grid shrink-0 place-items-center rounded-[10px] bg-[var(--brand)] text-[var(--primary-foreground)] shadow-[var(--shadow-sm)] ${TILE_SIZE_CLASSES[size]}`}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 17c0-5 4-9 9-9s9 4 9 9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M7 17c0-3 2.2-5 5-5s5 2 5 5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.6"
          />
          <circle cx="12" cy="18.5" r="1.5" fill="currentColor" />
        </svg>
      </span>
      {showText && (
        <span
          className={`font-[family-name:var(--font-display)] font-semibold tracking-[-0.02em] ${TEXT_SIZE_CLASSES[size]}`}
        >
          Tatú
        </span>
      )}
    </div>
  )
}
