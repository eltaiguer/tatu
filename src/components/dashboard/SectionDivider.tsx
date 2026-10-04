export function SectionDivider({
  label,
  sub,
}: {
  label: string
  sub?: string
}) {
  return (
    <div className="mx-0 mt-[34px] mb-[18px] flex items-baseline gap-[14px]">
      <h2 className="m-0 font-[family-name:var(--font-display)] text-[20px] font-semibold whitespace-nowrap">
        {label}
      </h2>
      {sub && (
        <span className="text-[13px] whitespace-nowrap text-[var(--text-faint)]">
          {sub}
        </span>
      )}
      <span className="h-[1px] flex-1 self-center bg-[var(--border)]" />
    </div>
  )
}
