interface TatuLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

export function TatuLogo({ size = 'md', showText = true }: TatuLogoProps) {
  const tileSize = size === 'sm' ? 24 : size === 'lg' ? 48 : 34
  const iconSize = tileSize * 0.65

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: tileSize,
          height: tileSize,
          borderRadius: 10,
          background: 'var(--brand)',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          boxShadow: 'var(--shadow-sm)',
        }}
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
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: size === 'sm' ? 18 : size === 'lg' ? 30 : 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Tatú
        </span>
      )}
    </div>
  )
}
