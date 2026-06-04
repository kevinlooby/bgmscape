import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { color, radius } from './tokens'

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent-active'
export type IconButtonSize = 'sm' | 'md' | 'lg'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon (or any node). Sized internally — pass the icon at its natural size. */
  children: ReactNode
  /** Required for accessibility — every icon button needs a label. */
  'aria-label': string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** When true, the button reads as "currently on" (e.g. wander toggle, lookahead toggle). */
  active?: boolean
}

const dimensions: Record<IconButtonSize, { box: number; icon: number }> = {
  sm: { box: 28, icon: 14 },
  md: { box: 36, icon: 18 },
  lg: { box: 44, icon: 22 },
}

function variantStyle(variant: IconButtonVariant, active: boolean, disabled: boolean): CSSProperties {
  if (disabled) {
    return {
      background: color.borderSubtle,
      color: color.textDim,
      borderColor: color.borderSubtle,
    }
  }
  if (active || variant === 'accent-active') {
    return {
      background: color.accentDeep,
      color: color.textPrimary,
      borderColor: color.accent,
    }
  }
  switch (variant) {
    case 'primary':
      return {
        background: color.accentDeep,
        color: color.accentBright,
        borderColor: color.accent,
      }
    case 'secondary':
      return {
        background: color.surface,
        color: color.textMuted,
        borderColor: color.border,
      }
    case 'ghost':
      return {
        background: 'transparent',
        color: color.textMuted,
        borderColor: 'transparent',
      }
  }
}

export function IconButton({
  children,
  variant = 'secondary',
  size = 'md',
  active = false,
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const dim = dimensions[size]
  return (
    <button
      disabled={disabled}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim.box,
        height: dim.box,
        borderRadius: radius.md,
        border: '1px solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        padding: 0,
        flexShrink: 0,
        ...variantStyle(variant, active, !!disabled),
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** Default Lucide icon size for an IconButton of the given size. Pass this to
 *  the `size` prop on the icon element to keep visual sizes in lockstep:
 *
 *      <IconButton size="md" ...><Play size={iconSize.md} /></IconButton>
 */
export const iconSize: Record<IconButtonSize, number> = {
  sm: dimensions.sm.icon,
  md: dimensions.md.icon,
  lg: dimensions.lg.icon,
}
