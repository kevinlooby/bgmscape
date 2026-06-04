import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { color, font, fontSize, radius, space, weight } from './tokens'

export type ChipTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'muted'
export type ChipSize = 'sm' | 'md'

interface ChipProps {
  children: ReactNode
  tone?: ChipTone
  size?: ChipSize
  /** When true, the chip reads as "selected/active" — filled variant. */
  active?: boolean
  /** Renders a leading dot in the tone color. Used for status indicators. */
  withDot?: boolean
  onClick?: MouseEventHandler<HTMLSpanElement>
  title?: string
  style?: CSSProperties
  /** Use monospace inside the chip (e.g. file names, IDs, exact times). */
  monospace?: boolean
}

interface ToneColors { fg: string; bg: string; border: string }

function toneColors(tone: ChipTone, active: boolean): ToneColors {
  // Active chips always use the filled background; inactive use a quieter
  // surface background, with the tone color carried by text and border.
  switch (tone) {
    case 'accent':
      return {
        fg: active ? color.textPrimary : color.accentBright,
        bg: active ? color.accentDeep : color.accentBg,
        border: color.accent,
      }
    case 'success':
      return {
        fg: color.success,
        bg: active ? color.successBg : color.surfaceSubtle,
        border: active ? color.success : color.successBorder,
      }
    case 'danger':
      return {
        fg: color.danger,
        bg: active ? color.dangerBg : color.surfaceSubtle,
        border: active ? color.danger : color.dangerBorder,
      }
    case 'warning':
      return {
        fg: color.warning,
        bg: color.surfaceSubtle,
        border: color.warning,
      }
    case 'muted':
      return {
        fg: color.textDim,
        bg: color.surfaceSubtle,
        border: color.borderSubtle,
      }
    case 'neutral':
    default:
      return {
        fg: active ? color.textPrimary : color.textMuted,
        bg: active ? color.surface : color.surfaceSubtle,
        border: color.border,
      }
  }
}

const sizeStyle: Record<ChipSize, CSSProperties> = {
  sm: { padding: `2px ${space.sm}px`, fontSize: fontSize.xs, gap: 4 },
  md: { padding: `${space.xs}px ${space.md}px`, fontSize: fontSize.sm, gap: space.xs },
}

export function Chip({
  children,
  tone = 'neutral',
  size = 'sm',
  active = false,
  withDot = false,
  onClick,
  title,
  style,
  monospace = false,
}: ChipProps) {
  const tc = toneColors(tone, active)
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: radius.pill,
        background: tc.bg,
        color: tc.fg,
        border: `1px solid ${tc.border}`,
        fontFamily: monospace ? font.mono : font.sans,
        fontWeight: active ? weight.bold : weight.regular,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        ...sizeStyle[size],
        ...style,
      }}
    >
      {withDot && (
        <span style={{
          display: 'inline-block',
          width: 6, height: 6, borderRadius: '50%',
          background: tc.fg,
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  )
}
