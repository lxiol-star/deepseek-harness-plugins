import { describe, expect, it } from 'vitest'
import { EFFECTS_CSS } from '../../src/client/effects/css.js'

/** Strip comments so selector assertions see only live CSS. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every prelude (text before `{`) of the stylesheet, nested blocks included. */
function preludes(css: string): string[] {
  return [...withoutComments(css).matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((value) => value !== '')
}

const isKeyframeStep = (prelude: string): boolean =>
  /^(from|to|\d+(?:\.\d+)?%)$/.test(prelude)
  || prelude.split(',').every((part) => /^\s*(from|to|\d+(?:\.\d+)?%)\s*$/.test(part))

describe('effect stylesheet scope', () => {
  it('is a non-empty stylesheet', () => {
    expect(EFFECTS_CSS.length).toBeGreaterThan(2000)
    expect(EFFECTS_CSS).toContain('.we-layer')
    expect(EFFECTS_CSS).toContain('@keyframes we-core-breathe')
  })

  it('balances its braces', () => {
    const css = withoutComments(EFFECTS_CSS)
    const opens = [...css].filter((char) => char === '{').length
    const closes = [...css].filter((char) => char === '}').length
    expect(opens).toBe(closes)
  })

  it('scopes every selector to a .we- class or a [data-we-*] attribute', () => {
    for (const prelude of preludes(EFFECTS_CSS)) {
      if (prelude.startsWith('@')) continue
      if (isKeyframeStep(prelude)) continue
      expect(prelude, `unscoped selector: ${prelude}`).toMatch(/\.we-|\[data-we-/)
    }
  })

  it('never targets the host layout classes', () => {
    for (const prelude of preludes(EFFECTS_CSS)) {
      expect(prelude).not.toContain('.re-')
    }
  })

  it('avoids prohibited global constructs', () => {
    const css = withoutComments(EFFECTS_CSS)
    expect(css).not.toContain('!important')
    expect(css).not.toContain(':root')
    expect(css).not.toMatch(/(^|[\s,{}>+~])(html|body)(?=[\s,{.:[>+~])/)
  })

  it('styles every state attribute the rail exposes', () => {
    expect(EFFECTS_CSS).toContain('[data-we-skin="holo"]')
    expect(EFFECTS_CSS).toContain('[data-we-skin="chrome"]')
    expect(EFFECTS_CSS).toContain('[data-we-skin="fluid"]')
    expect(EFFECTS_CSS).toContain('[data-we-ultra="1"]')
    expect(EFFECTS_CSS).toContain('[data-we-lightning="1"]')
    expect(EFFECTS_CSS).toContain('[data-we-theme="light"]')
  })

  it('freezes every effect animation under reduced motion', () => {
    expect(EFFECTS_CSS).toContain('prefers-reduced-motion: reduce')
    expect(EFFECTS_CSS).toContain('@keyframes we-bolt-sweep')
    expect(EFFECTS_CSS).toContain('@keyframes we-knob-ultra')
  })

  it('does not change the host slider box through the layer root', () => {
    const layerRule = withoutComments(EFFECTS_CSS).match(/\.we-layer\s*\{([^}]*)\}/)
    expect(layerRule).not.toBeNull()
    const body = layerRule?.[1] ?? ''
    expect(body).not.toMatch(/(^|[\s;])(height|padding|margin)\s*:/)
    expect(body).toContain('position: absolute')
    expect(body).toContain('inset: 0')
    expect(body).toContain('pointer-events: none')
  })

  it('keeps the effect layer below the host thumb', () => {
    const layerRule = withoutComments(EFFECTS_CSS).match(/\.we-layer\s*\{([^}]*)\}/)
    const zIndex = layerRule?.[1]?.match(/z-index\s*:\s*(\d+)/)
    expect(zIndex).not.toBeNull()
    expect(Number(zIndex?.[1])).toBeLessThan(4)
  })
})
