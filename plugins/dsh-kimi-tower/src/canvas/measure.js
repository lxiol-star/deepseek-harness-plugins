/**
 * Text metrics for the tower canvas.
 *
 * The canvas is drawn with absolutely positioned DOM cards, so every card's
 * height has to be known *before* React renders it. The layout module takes
 * those numbers from here: a small deterministic width estimator plus a greedy
 * line breaker. Nothing touches the DOM or the platform, which keeps the layout
 * a pure function of the snapshot (and testable in node).
 *
 * Cards render the lines this module produced, one `nowrap` row per line, so
 * the estimate and the screen can never disagree about how many lines a text
 * takes. The estimate only decides where a line ends. It is biased a hair wide:
 * an over-estimate leaves a ragged line end, an under-estimate would clip.
 */

/** Lower-case Latin letters that are visibly narrower than the rest. */
const NARROW_LOWER = new Set([105, 108, 106, 116, 102, 114])
/** Lower-case Latin letters that are visibly wider than the rest. */
const WIDE_LOWER = new Set([109, 119])
/** Upper-case Latin letters that are visibly narrower than the rest. */
const NARROW_UPPER = new Set([73, 74, 76])

/** Whether a code point is set full-width in every font the canvas declares. */
function isWide(code) {
  return (code >= 0x2e80 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6)
}

/**
 * Advance width of one code point, in em.
 *
 * Tuned for the system UI stack the canvas declares (SF Pro / Segoe UI with
 * PingFang SC / Microsoft YaHei / Noto Sans CJK). `mono` is the monospace
 * stack used for paths and globs, where every ASCII glyph is three fifths of
 * an em.
 *
 * @param code - a Unicode code point.
 * @param mono - measure with the monospace stack.
 * @returns the advance width in em.
 */
export function charEm(code, mono = false) {
  if (mono) return code < 0x2e80 ? 0.6 : 1
  if (code === 32) return 0.28
  if (code >= 48 && code <= 57) return 0.58
  if (code >= 65 && code <= 90) return NARROW_UPPER.has(code) ? 0.32 : 0.68
  if (code >= 97 && code <= 122) {
    if (WIDE_LOWER.has(code)) return 0.84
    if (NARROW_LOWER.has(code)) return 0.3
    return 0.55
  }
  if (isWide(code)) return 1
  if (code >= 0x3000 && code <= 0x303f) return 1
  if (code === 0x2026) return 1
  if (code >= 0x2010 && code <= 0x2027) return 0.5
  if (code === 0xb7 || code === 0x2022) return 0.35
  if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf)) return 1.05
  if (code < 0x80) return 0.56
  return 0.62
}

/**
 * Advance width of a string.
 *
 * @param text - the string to measure.
 * @param fontSize - the font size in px.
 * @param mono - measure with the monospace stack.
 * @param scale - extra factor, for a heavier weight.
 * @returns the width in px.
 */
export function textWidth(text, fontSize, mono = false, scale = 1) {
  let em = 0
  for (const ch of String(text)) em += charEm(ch.codePointAt(0), mono)
  return em * fontSize * scale
}

// Punctuation that must not start a line, and so sticks to the atom before it.
const CLOSERS = '.,;:!?%)\]}）〉》」』】〕、。，；：！？·…'
// Punctuation that must not end a line, and so sticks to the atom after it.
const OPENERS = '([{〈《「『【〔（“‘'

/**
 * Split a text into atoms a line break may sit between.
 *
 * A run of Latin letters, digits and underscores is one atom (a word is never
 * split unless it is too wide for a whole line). Every full-width character is
 * its own atom, which is what makes mixed Chinese/English text break cleanly.
 * Closing punctuation glues onto the atom before it and opening punctuation
 * onto the one after it.
 */
function tokenize(text) {
  const raw = []
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    let kind = 'char'
    if (/\s/.test(ch)) kind = 'space'
    else if (/[A-Za-z0-9_]/.test(ch)) kind = 'word'
    else if (CLOSERS.includes(ch)) kind = 'close'
    else if (OPENERS.includes(ch)) kind = 'open'
    else if (isWide(code)) kind = 'cjk'

    const last = raw[raw.length - 1]
    if (last !== undefined && ((kind === 'word' && last.kind === 'word') || (kind === 'space' && last.kind === 'space'))) {
      last.text += ch
      continue
    }
    raw.push({ text: ch, kind })
  }

  // Closing punctuation must not start a line: it joins the atom before it.
  const atoms = []
  for (const atom of raw) {
    const last = atoms[atoms.length - 1]
    if (atom.kind === 'close' && last !== undefined && last.kind !== 'space') {
      last.text += atom.text
      continue
    }
    atoms.push(atom)
  }
  // Opening punctuation must not end a line: it joins the atom after it. Walk
  // backwards so a run of openers collapses into the atom that follows it all.
  for (let index = atoms.length - 2; index >= 0; index -= 1) {
    if (atoms[index].kind !== 'open') continue
    const next = atoms[index + 1]
    next.text = `${atoms[index].text}${next.text}`
    next.kind = 'chunk'
    atoms.splice(index, 1)
  }
  // An opener that ends the text has nothing to stick to.
  for (const atom of atoms) if (atom.kind === 'open') atom.kind = 'char'
  return atoms
}

/**
 * Break a text into lines that each fit a width.
 *
 * @param text - the text to break.
 * @param maxWidth - the available width in px.
 * @param fontSize - the font size in px.
 * @param maxLines - keep at most this many lines (0 keeps every line).
 * @param mono - measure with the monospace stack.
 * @param scale - extra width factor, for a heavier weight.
 * @returns the lines, and how many further lines were cut by `maxLines`.
 */
export function wrapLines(text, maxWidth, fontSize, maxLines = 0, mono = false, scale = 1) {
  const limit = Math.max(12, maxWidth)
  const lines = []
  let line = ''
  let lineW = 0
  const flush = () => {
    if (line.trim().length > 0) lines.push(line.replace(/\s+$/, ''))
    line = ''
    lineW = 0
  }

  for (const atom of tokenize(String(text ?? ''))) {
    const width = textWidth(atom.text, fontSize, mono, scale)
    if (lineW + width > limit && line.trim().length > 0) {
      if (atom.kind === 'space') continue
      flush()
    }
    if (width > limit) {
      // One atom wider than a whole line (a long path, say): split by character.
      flush()
      for (const ch of atom.text) {
        const char = textWidth(ch, fontSize, mono, scale)
        if (lineW + char > limit && line.length > 0) flush()
        line += ch
        lineW += char
      }
      continue
    }
    line += atom.text
    lineW += width
  }
  flush()

  let more = 0
  if (maxLines > 0 && lines.length > maxLines) {
    more = lines.length - maxLines
    lines.length = maxLines
    // The last line kept says with an ellipsis that there was more.
    if (lines.length > 0) lines[lines.length - 1] = ellipsize(lines[lines.length - 1], limit, fontSize, mono, scale)
  }
  return { lines, more }
}

/**
 * End a line with an ellipsis, trimming it until both still fit a width.
 *
 * @param line - the line to mark.
 * @param limit - the available width in px.
 * @param fontSize - the font size in px.
 * @param mono - measure with the monospace stack.
 * @param scale - extra width factor, for a heavier weight.
 * @returns the trimmed line, ending in `…`.
 */
function ellipsize(line, limit, fontSize, mono, scale) {
  let out = line
  while (out.length > 0 && textWidth(`${out}…`, fontSize, mono, scale) > limit) {
    out = out.slice(0, -1)
    const tail = out.charCodeAt(out.length - 1)
    // Never leave half of a surrogate pair at the end.
    if (tail >= 0xd800 && tail <= 0xdbff) out = out.slice(0, -1)
  }
  return out.length === 0 ? '…' : `${out}…`
}

/**
 * Shorten a text to one line, ending it with an ellipsis when it had to cut.
 *
 * @param text - the text to fit.
 * @param maxWidth - the available width in px.
 * @param fontSize - the font size in px.
 * @param mono - measure with the monospace stack.
 * @returns the fitted line.
 */
export function fitLine(text, maxWidth, fontSize, mono = false) {
  const value = String(text ?? '')
  const limit = Math.max(12, maxWidth)
  if (textWidth(value, fontSize, mono) <= limit) return value
  const ellipsis = textWidth('…', fontSize, mono)
  let low = 0
  let high = value.length
  // Binary search the longest prefix that still leaves room for the ellipsis.
  // The search is over UTF-16 units, so re-check the surrogate boundary after.
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (textWidth(value.slice(0, mid), fontSize, mono) + ellipsis <= limit) low = mid
    else high = mid - 1
  }
  let cut = low
  if (cut > 0 && cut < value.length) {
    const code = value.charCodeAt(cut - 1)
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1
  }
  return `${value.slice(0, cut).replace(/\s+$/, '')}…`
}
