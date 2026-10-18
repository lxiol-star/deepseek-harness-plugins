import { describe, expect, it } from 'vitest'
import { STYLESHEET } from '../src/client/css.ts'

/** The rule block whose selector matches exactly one of the given selectors. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(STYLESHEET)
  if (match === null) throw new Error(`missing rule: ${selector}`)
  return match[1] as string
}

describe('trackpad scrolling inside the dock and board', () => {
  it('never traps two-finger scrolling in a summary card', () => {
    const collapsed = block('.sb-root .sb-card[data-expanded="false"] .sb-card-content')
    // `clip` does not create a scroll container, so the wheel never stops here.
    expect(collapsed).toContain('overflow: clip')
    expect(collapsed).not.toContain('overflow: hidden')
    expect(collapsed).not.toContain('overscroll-behavior')
  })

  it('lets an expanded preview chain to the list once it reaches its end', () => {
    const content = block('.sb-card-content')
    expect(content).toContain('overflow-y: auto')
    expect(content).toContain('overscroll-behavior-y: auto')
    expect(content).not.toContain('overscroll-behavior: contain')
  })

  it('keeps the list itself a bounded vertical scroller', () => {
    const scroll = block('.sb-scroll')
    expect(scroll).toContain('overflow-y: auto')
    expect(scroll).toContain('min-height: 0')
  })
})
