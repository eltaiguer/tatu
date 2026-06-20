import type { ReactNode } from 'react'
import type { Currency } from '../models'
import { Card } from './ui/card'
import { IconTile } from './ui/icon-tile'
import { formatCurrency } from '../utils/formatting'

interface AccountCardProps {
  icon: ReactNode
  title: string
  subtitle: ReactNode
  label: string
  primaryAmount: number
  primaryCurrency: Currency
  primaryColor: string
  primaryFontSize?: number
  secondaryAmount?: number
  secondaryCurrency?: Currency
  movimientos: number
  convertedAmount: number
  homeCurrency: Currency
  onClick?: () => void
}

export function AccountCard({
  icon,
  title,
  subtitle,
  label,
  primaryAmount,
  primaryCurrency,
  primaryColor,
  primaryFontSize = 24,
  secondaryAmount,
  secondaryCurrency,
  movimientos,
  convertedAmount,
  homeCurrency,
  onClick,
}: AccountCardProps) {
  return (
    <Card
      className={onClick ? 'p-5 cursor-pointer' : 'p-5'}
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconTile size="lg" bg="var(--surface-2)" color="var(--brand)">
          {icon}
        </IconTile>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
          <div className="text-muted-foreground" style={{ fontSize: 12 }}>{subtitle}</div>
        </div>
      </div>
      <div>
        <div
          className="text-muted-foreground"
          style={{ fontSize: 12, fontWeight: 500 }}
        >
          {label}
        </div>
        <div style={{ marginTop: 4 }}>
          <div
            className="font-mono"
            style={{ fontSize: primaryFontSize, color: primaryColor }}
          >
            {formatCurrency(primaryAmount, primaryCurrency)}
          </div>
          {secondaryAmount !== undefined &&
            secondaryCurrency !== undefined &&
            secondaryAmount > 0 && (
              <div
                className="font-mono text-muted-foreground"
                style={{ fontSize: 14, marginTop: 2 }}
              >
                {formatCurrency(secondaryAmount, secondaryCurrency)}
              </div>
            )}
        </div>
      </div>
      <div
        style={{
          fontSize: 11.5,
          marginTop: 'auto',
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--text-faint)',
        }}
      >
        <span>{movimientos} movimientos</span>
        <span className="font-mono">
          ≈ {formatCurrency(convertedAmount, homeCurrency)}
        </span>
      </div>
    </Card>
  )
}
