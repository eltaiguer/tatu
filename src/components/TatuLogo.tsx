interface TatuLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

const SIZES = {
  sm: { icon: 24, text: 'text-lg' },
  md: { icon: 32, text: 'text-xl' },
  lg: { icon: 48, text: 'text-3xl' },
} as const

export function TatuLogo({
  size = 'md',
  showText = true,
  className,
}: TatuLogoProps) {
  const selectedSize = SIZES[size]

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`.trim()}>
      <svg
        width={selectedSize.icon}
        height={selectedSize.icon}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <path
          d="M4 16C4 12 8 8 12 8C16 8 18 10 20 12C22 14 24 16 28 16"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-primary"
        />
        <path
          d="M4 22C4 18 8 14 12 14C16 14 18 16 20 18C22 20 24 22 28 22"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-accent"
        />
        <circle
          cx="12"
          cy="8"
          r="2.5"
          fill="currentColor"
          className="text-primary"
        />
        <circle
          cx="20"
          cy="12"
          r="2"
          fill="currentColor"
          className="text-primary opacity-70"
        />
      </svg>
      {showText ? (
        <span
          className={`font-display ${selectedSize.text} font-normal tracking-tighter text-foreground`}
        >
          Tatú
        </span>
      ) : null}
    </div>
  )
}
