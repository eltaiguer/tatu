interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'light' | 'dark'
  showText?: boolean
  className?: string
}

export function Logo({
  size = 'md',
  variant = 'default',
  showText = true,
  className = '',
}: LogoProps) {
  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 48,
  }

  const textStyles = {
    sm: 'text-[18px] tracking-[-0.45px] leading-[28px]',
    md: 'text-[20px] tracking-[-0.5px] leading-[28px]',
    lg: 'text-[30px] tracking-[-0.75px] leading-[36px]',
  }

  const textColor =
    variant === 'light' || variant === 'dark'
      ? 'text-white'
      : 'text-[#0f172a] dark:text-white'

  const iconSize = iconSizes[size]

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        fill="none"
      >
        <path
          d="M6 24C6 18 12 12 18 12C24 12 27 15 30 18C33 21 36 24 42 24"
          stroke="#0066CE"
          strokeWidth="3.75"
          strokeLinecap="round"
        />
        <path
          d="M6 33C6 27 12 21 18 21C24 21 27 24 30 27C33 30 36 33 42 33"
          stroke="#EB6F47"
          strokeWidth="3.75"
          strokeLinecap="round"
        />
        <path
          d="M18 15.75C20.0711 15.75 21.75 14.0711 21.75 12C21.75 9.92893 20.0711 8.25 18 8.25C15.9289 8.25 14.25 9.92893 14.25 12C14.25 14.0711 15.9289 15.75 18 15.75Z"
          fill="#0066CE"
        />
        <path
          opacity="0.7"
          d="M30 21C31.6569 21 33 19.6569 33 18C33 16.3431 31.6569 15 30 15C28.3431 15 27 16.3431 27 18C27 19.6569 28.3431 21 30 21Z"
          fill="#0066CE"
        />
      </svg>
      {showText ? (
        <span className={`font-space-grotesk font-normal ${textStyles[size]} ${textColor}`}>
          Tatú
        </span>
      ) : null}
    </div>
  )
}
