// Keyboard equivalent of clicking a chart's bars: one button per bar, hidden
// until one of them is focused.

export function MonthButtons({
  label,
  buttons,
}: {
  label: string
  buttons: { key: string; text: string; onClick: () => void }[]
}) {
  return (
    <nav
      aria-label={label}
      className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:flex focus-within:flex-wrap focus-within:gap-1"
    >
      {buttons.map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={b.onClick}
          className="rounded border border-border px-2 py-0.5 text-xs"
        >
          {b.text}
        </button>
      ))}
    </nav>
  )
}
