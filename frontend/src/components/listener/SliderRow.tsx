import { color, font, fontSize, space } from '@/ui/tokens'

interface SliderRowProps {
  label: string
  /** Optional tooltip text (shown on hover via the native `title` attr). */
  tooltip?: string
  value: number
  min: number
  max: number
  step: number
  /** Formatter for the numeric readout shown on the right (e.g. `v => v.toFixed(2)`). */
  format: (v: number) => string
  onChange: (v: number) => void
}

/** A label + range slider + numeric readout row. Used by the settings page
 *  for every tuning slider. Kept generic so the same row works for time-in-ms,
 *  0-to-1 ratios, etc. */
export function SliderRow({
  label, tooltip, value, min, max, step, format, onChange,
}: SliderRowProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: space.md,
      marginBottom: space.sm,
    }}>
      <span
        title={tooltip}
        style={{
          fontFamily: font.sans,
          fontSize: fontSize.sm,
          color: color.textBody,
          width: 110,
          flexShrink: 0,
          cursor: tooltip ? 'help' : undefined,
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, cursor: 'pointer', accentColor: color.accent }}
      />
      <span style={{
        fontFamily: font.mono,
        fontSize: fontSize.sm,
        color: color.accentBright,
        width: 56,
        textAlign: 'right',
      }}>
        {format(value)}
      </span>
    </div>
  )
}
