/**
 * Inline icon set for the manager drawer.
 *
 * The plugin ships no icon dependency: the shell's frozen module table has no
 * icon library, and pulling one into the bundle would cost more than the dozen
 * glyphs the drawer needs. Every glyph is a stroked 24×24 path drawn in
 * `currentColor`, so it follows the theme tokens like text does.
 */
import type { ReactElement, ReactNode } from 'react'

/** Props shared by every icon. */
export interface ManagerIconProps {
  /** Rendered square size in CSS pixels; defaults to the 16px control size. */
  size?: number
  /** Extra class for alignment tweaks at call sites. */
  className?: string
}

/** Shared stroked SVG frame. */
function Glyph({ children, size = 16, className }: ManagerIconProps & { children: ReactNode }): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Hide the navigator: a panel whose left column collapses. */
export function IconPanelLeftClose(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9.5 3v18" />
      <path d="m15.5 15.5-3-3.5 3-3.5" />
    </Glyph>
  )
}

/** Show the navigator. */
export function IconPanelLeftOpen(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M9.5 3v18" />
      <path d="m13.5 9 3 3.5-3 3.5" />
    </Glyph>
  )
}

/** Fill the viewport with the panel. */
export function IconMaximize(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Glyph>
  )
}

/** Restore the floating panel size. */
export function IconRestore(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </Glyph>
  )
}

/** Re-read host state. */
export function IconRefresh(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M3.5 12a8.5 8.5 0 0 1 14.6-5.9L21 9" />
      <path d="M21 3.5V9h-5.5" />
      <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L3 15" />
      <path d="M3 20.5V15h5.5" />
    </Glyph>
  )
}

/** Open the manager in the main chat. */
export function IconExternal(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Glyph>
  )
}

/** Close the panel. */
export function IconClose(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Glyph>
  )
}

/** Expand a section. */
export function IconChevronDown(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m6 9 6 6 6-6" />
    </Glyph>
  )
}

/** Collapsed section marker. */
export function IconChevronRight(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m9 6 6 6-6 6" />
    </Glyph>
  )
}

/** Workspace filter input. */
export function IconSearch(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Glyph>
  )
}

/** Confirmation and checked rows. */
export function IconCheck(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  )
}

/** Send the selection to the manager. */
export function IconSend(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </Glyph>
  )
}

/** Automatic wakeups. */
export function IconBell(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Glyph>
  )
}

/** Workspace section. */
export function IconFolder(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M4 20h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-8l-2-2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z" />
    </Glyph>
  )
}

/** Session section. */
export function IconLayers(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m12 2.5 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 17.5 9 5 9-5" />
    </Glyph>
  )
}

/** Task section. */
export function IconTasks(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <rect x="3" y="4.5" width="6" height="6" rx="1.5" />
      <path d="m4.5 7.5 1 1 2-2" />
      <path d="M13 6.5h8" />
      <path d="M13 12h8" />
      <path d="M13 17.5h8" />
      <path d="M3.5 16.5h5" />
      <path d="M3.5 20h5" />
    </Glyph>
  )
}

/** Project paths are visible. */
export function IconEye(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.85" />
    </Glyph>
  )
}

/** Project paths are hidden. */
export function IconEyeOff(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m3 3 18 18" />
      <path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17.6 17.6 0 0 1-3.4 4" />
      <path d="M6.2 7.6C3.9 9.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.7-.3 3.8-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Glyph>
  )
}

/** Empty-state mark for a pane with nothing to show. */
export function IconSparkle(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="M5.5 15.5 6.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z" />
    </Glyph>
  )
}

/** Inline hint affordance. */
export function IconInfo(props: ManagerIconProps): ReactElement {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16.5v-4.5" />
      <path d="M12 7.75h.01" />
    </Glyph>
  )
}
