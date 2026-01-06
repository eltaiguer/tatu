// Tatu Logo - Uruguayan expense tracker brand

interface TatuLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function TatuLogo({ size = 'md', showText = true }: TatuLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 48, text: 'text-3xl' },
  };

  return (
    <div className="flex items-center gap-2">
      {/* Tatu icon - Abstract wave pattern inspired by Río de la Plata */}
      <svg
        width={sizes[size].icon}
        height={sizes[size].icon}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
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
        <circle cx="12" cy="8" r="2.5" fill="currentColor" className="text-primary" />
        <circle cx="20" cy="12" r="2" fill="currentColor" className="text-primary opacity-70" />
      </svg>
      {showText && (
        <span className={`font-display ${sizes[size].text} tracking-tight`}>
          Tatú
        </span>
      )}
    </div>
  );
}
