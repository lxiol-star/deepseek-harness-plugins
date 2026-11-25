/**
 * Plain text from the snapshot: the only kind of text the canvas shows.
 *
 * A snapshot carries whatever the tower, the workers and the user wrote, and
 * an agent can write anything. The canvas never interprets a snapshot string
 * as markup — everything is rendered as a React text node — but invisible
 * characters can still mislead a reader on their own: a bidi override can
 * make `M4 done‮` read as something else, and control characters can break
 * lines or hide text in lists and tooltips.
 *
 * `sanitizeText` is applied once, where the snapshot enters the canvas (the
 * readers in `./layout.js`), so nothing downstream has to remember.
 */

/** Whitespace of every kind, folded to one space. */
const SPACE = /\s+/g
/**
 * C0 and C1 control characters other than tab, line feed and carriage return
 * (those are whitespace and are folded above): NUL, ESC, the information
 * separators, DEL, NEL and the rest of the C1 range.
 */
const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
/** Bidirectional formatting characters and directional marks. */
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/**
 * Make a snapshot string safe to show.
 *
 * Control and bidirectional characters are removed, every run of whitespace
 * (line breaks included) becomes one space, and the ends are trimmed. Emoji,
 * combining marks and every letter of every script are left alone.
 *
 * @param value - anything a snapshot field held.
 * @returns the cleaned text; an empty string for anything that is not a string.
 */
export function sanitizeText(value) {
  if (typeof value !== 'string') return ''
  return value.replace(SPACE, ' ').replace(CONTROLS, '').replace(BIDI, '').trim()
}
