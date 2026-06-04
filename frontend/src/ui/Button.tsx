import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { color, font, fontSize, radius, space, weight } from './tokens'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Optional Lucide icon (or any node) rendered left of the label. */
  leading?: ReactNode
  /** Optional node rendered right of the label. */
  trailing?: ReactNode
  children?: ReactNode
}

const sizeStyle: Record<ButtonSize, CSSProperties> = {
  sm: { padding: `${space.xs}px ${space.md}px`, fontSize: fontSize.sm, gap: space.xs },
  md: { padding: `${space.sm}px ${space.lg}px`, fontSize: fontSize.md, gap: space.sm },
  lg: { padding: `${space.md}px ${space.xl}px`, fontSize: fontSize.lg, gap: space.sm },
}

function variantStyle(variant: ButtonVariant, disabled: boolean): CSSProperties {
  if (disabled) {
    return {
      background: color.borderSubtle,
      color: color.textDim,
      border: `1px solid ${color.borderSubtle}`,
      cursor: 'not-allowed',
    }
  }
  switch (variant) {
    case 'primary':
      return {
        background: color.accentDeep,
        color: color.textPrimary,
        border: `1px solid ${color.accent}`,
      }
    case 'secondary':
      return {
        background: color.surface,
        color: color.textMuted,
        border: `1px solid ${color.border}`,
      }
    case 'ghost':
      return {
        background: 'transparent',
        color: color.textMuted,
        border: `1px solid transparent`,
      }
    case 'danger':
      return {
        background: color.dangerBg,
        color: color.danger,
        border: `1px solid ${color.dangerBorder}`,
      }
  }
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leading,
  trailing,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        fontFamily: font.sans,
        fontWeight: weight.medium,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
        ...sizeStyle[size],
        ...variantStyle(variant, !!disabled),
        ...style,
      }}
    >
      {leading}
      {children}
      {trailing}
    </button>
  )
}
