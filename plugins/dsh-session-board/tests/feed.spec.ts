import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardFeedClient, parseFeed } from '../src/client/feed.ts'

afterEach(() => vi.unstubAllGlobals())
describe('client feed safety', () => {
  it('preserves concurrent acknowledgements and connection state on one failure', async () => {
    let fail!: (reason: Error) => void
    vi.stubGlobal('fetch', vi.fn((_url: string, options: { body: string }) => {
      const id = JSON.parse(options.body).sessionId
      return id === 'a' ? new Promise((_resolve, reject) => { fail = reject }) : Promise.resolve(new Response('{}'))
    }))
    const feed = new BoardFeedClient()
    feed.apply({ acks: {}, turns: {} })
    const pending = feed.ack('a'); await feed.ack('b')
    const b = feed.getSnapshot().feed.acks.b?.ackedAt
    fail(new Error('failed')); await pending
    expect(feed.getSnapshot().feed.acks.b?.ackedAt).toBe(b)
    expect(feed.getSnapshot().feed.acks.a).toBeUndefined()
    expect(feed.getSnapshot().online).toBe(true)
    feed.dispose()
  })
  it('rolls back failed HTTP ack without clobbering newer SSE snapshots', async () => {
    let respond!: (value: Response) => void
    vi.stubGlobal('fetch', () => new Promise(resolve => { respond = resolve }))
    const feed = new BoardFeedClient()
    const pending = feed.ack('a')
    feed.apply({ acks: { a: { ackedAt: 123 }, b: { ackedAt: 456 } }, turns: {} })
    respond(new Response('{}', { status: 500 })); await pending
    expect(feed.getSnapshot().feed.acks.a?.ackedAt).toBe(123)
    expect(feed.getSnapshot().feed.acks.b?.ackedAt).toBe(456)
    feed.dispose()
  })
  it('preserves external session keys without prototype mutation', () => {
    const parsed = parseFeed('{"acks":{"__proto__":{"ackedAt":1}},"turns":{}}')!
    expect(Object.getPrototypeOf(parsed.acks)).toBeNull()
    expect(parsed.acks.__proto__?.ackedAt).toBe(1)
  })
  it('rejects a host half that predates the synthesis workflow instead of a selection error', async () => {
    const fetch = vi.fn(async (_url: string, _options: { body: string }) => new Response('{"ok":false,"error":"INVALID_SELECTION"}', { status: 400 }))
    vi.stubGlobal('fetch', fetch)
    const feed = new BoardFeedClient()
    // The probe runs before any preview, so an outdated host never reaches the preview action.
    await expect(feed.previewArchive(['id'])).rejects.toThrow('HOST_OUTDATED')
    await expect(feed.commitArchive('token')).rejects.toThrow('HOST_OUTDATED')
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({ action: 'capabilities' })
    feed.dispose()
  })
  it('preview sends only read-only action and missing API gives a useful error code', async () => {
    const fetch = vi.fn(async (_url: string, _options: { body: string }) => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const feed = new BoardFeedClient()
    await expect(feed.previewArchive(['id'])).rejects.toThrow('ARCHIVE_UNAVAILABLE')
    feed.dispose()
  })
})
