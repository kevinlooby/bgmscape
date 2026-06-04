import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { color, font, fontSize, space, weight } from './tokens'

interface PageHeaderProps {
  /** Main title. If `to` is given, the title becomes a link. */
  title: string
  /** Where the title links to. Defaults to '/'. Pass `null` to make it non-clickable. */
  to?: string | null
  /** Small muted subtitle rendered after a vertical divider. Use for the game name etc. */
  subtitle?: ReactNode
  /** Anything passed here is rendered on the right side of the header (volume, gear, edit, etc.) */
  children?: ReactNode
}

/** Shared top bar across every page. Replaces the four inline header
 *  implementations (GameGrid, AmbientLibrary, Listener, Editor toolbar). */
export function PageHeader({ title, to = '/', subtitle, children }: PageHeaderProps) {
  const titleNode = (
    <span style={{
      color: color.accent,
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.lg,
      letterSpacing: '-0.01em',
    }}>
      {title}
    </span>
  )

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: space.md,
      padding: `${space.md}px ${space.xl}px`,
      background: color.surface,
      borderBottom: `1px solid ${color.border}`,
      flexShrink: 0,
    }}>
      {to ? (
        <Link to={to} style={{ textDecoration: 'none' }}>
          {titleNode}
        </Link>
      ) : titleNode}

      {subtitle && (
        <>
          <div style={{ width: 1, height: 18, background: color.border }} />
          <span style={{
            color: color.textFaint,
            fontFamily: font.sans,
            fontSize: fontSize.sm,
          }}>
            {subtitle}
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {children}
    </div>
  )
}
