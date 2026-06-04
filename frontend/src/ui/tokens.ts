// Design tokens — the single source of truth for color, spacing, type, radius.
//
// Until this file existed, every page pasted hex codes inline (~50 instances of
// `#4a90d9` alone). New code should import from here; older pages migrate one at
// a time. Values are unchanged from the old inline palette so a partial-migration
// codebase still looks consistent.

export const color = {
  // Backgrounds
  bg: '#0a1520',
  surface: '#0f1923',            // standard card background
  surfaceRaised: '#162638',      // brighter — used for the primary card on a page
  surfaceSubtle: '#0c1822',      // dimmer — used for nested chips / ambient queued state

  // Borders / dividers
  border: '#2d4a6e',
  borderSubtle: '#1a2a3a',
  borderBright: '#4a90d9',       // accent border on active controls

  // Accent (primary blue)
  accent: '#4a90d9',
  accentBright: '#90b8e8',
  accentDeep: '#1e4a8a',
  accentBg: '#0d2040',           // dark-blue background for accent chips/badges

  // Text
  textPrimary: '#e8f0fe',        // largest/most important text
  textBody: '#c8d8e8',           // default body
  textMuted: '#8a9bb0',          // secondary, e.g. button labels
  textFaint: '#6a8aaa',          // tertiary, e.g. helper text
  textDim: '#4a6a8a',            // labels, very muted

  // Status
  success: '#4ade80',
  successBg: '#143824',
  successBorder: '#2f7a4a',
  danger: '#f87171',
  dangerBg: '#3a1e1e',
  dangerBorder: '#8a3a3a',
  warning: '#f0c040',
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 44,
} as const

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  pill: 999,
} as const

export const font = {
  // Inter for headings/body/UI labels. Loaded by main.tsx via @fontsource/inter.
  sans: "'Inter', system-ui, 'Segoe UI', Roboto, sans-serif",
  // Monospace reserved for "code-flavored" content — file paths, asset names,
  // node IDs, the keyboard-shortcut hint, exact numeric readouts.
  mono: "ui-monospace, 'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
} as const

export const fontSize = {
  xs: 11,    // tiny labels (uppercase section headers)
  sm: 12,    // body small, secondary text
  md: 13,    // body default, buttons
  lg: 16,    // emphasised body, card titles
  xl: 20,    // page subtitle / minor heading
  xxl: 26,   // page title
  hero: 34,  // the location name on now-playing
} as const

export const weight = {
  regular: 400,
  medium: 500,
  bold: 700,
} as const

// Breakpoint above which the listener page splits into two columns. Used by
// useMediaQuery in the listener layout.
export const breakpoint = {
  wide: 1200,
} as const

// Convenience: the shadow used to lift raised cards. Subtle on dark UI.
export const shadow = {
  raised: '0 4px 12px rgba(0, 0, 0, 0.3)',
} as const
