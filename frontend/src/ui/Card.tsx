import type { CSSProperties, ReactNode } from 'react'
import { color, radius, shadow, space } from './tokens'

export type CardVariant = 'default' | 'raised' | 'subtle'

interface CardProps {
  children: ReactNode
  /** `raised` for the single primary surface on a page (now-playing). `subtle`
   *  for borderless groupings that just need padding. `default` for everything
   *  else. */
  variant?: CardVariant
  /** Optional padding override. Defaults to `space.lg`. */
  padding?: number | string
  /** Extra inline styles, merged after variant defaults. */
  style?: CSSProperties
  className?: string
  onClick?: () => void
}

const variantStyle: Record<CardVariant, CSSProperties> = {
  default: {
    background: color.surface,
    border: `1px solid ${color.border}`,
    boxShadow: 'none',
  },
  raised: {
    background: color.surfaceRaised,
    border: `1px solid ${color.border}`,
    boxShadow: shadow.raised,
  },
  subtle: {
    background: 'transparent',
    border: `1px solid ${color.borderSubtle}`,
    boxShadow: 'none',
  },
}

export function Card({
  children,
  variant = 'default',
  padding = space.lg,
  style,
  className,
  onClick,
}: CardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        ...variantStyle[variant],
        borderRadius: radius.lg,
        padding,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
