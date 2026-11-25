import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { Ticket } from '../src/core/index.ts'
import { registerHttp, type HttpHost } from '../src/app/http.ts'
import { operatorQuestion } from '../src/app/views/tasks.ts'
import { UPLOAD_KEEP_DAYS, uploadName, filesNote, hasUploads, isUploaded, saveUpload, uploadedOnly, UploadError } from '../src/app/uploads.ts'

const dirs: string[] = []
/** A state directory of its own per test, and its removal afterwards. */
async function state(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sa-uploads-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
const b64 = (text: string): string => Buffer.from(text).toString('base64')

it('names a stored file safely and keeps what makes it identifiable', () => {
  expect(uploadName('截图.png')).toBe('截图.png')
  expect(uploadName('a/b/c.txt')).toBe('c.txt')
  expect(uploadName('..\\..\\etc\\passwd')).toBe('passwd')
  expect(uploadName('../../x.sh')).toBe('x.sh')
  // A name that would break the message line, the path or a shell keeps its letters and extension only.
  expect(uploadName('my file (1).png')).toBe('my-file-1-.png')
  expect(uploadName('a\nb\r\tc.png')).toBe('a-b-c.png')
  expect(uploadName('...hidden')).toBe('hidden')
  expect(uploadName('')).toBe('file')
  expect(uploadName('---')).toBe('file')
  // Long names are cut around their extension, which is what tells the reader the type.
  const long = uploadName(`${'x'.repeat(200)}.png`)
  expect(long.length).toBeLessThanOrEqual(96)
  expect(long.endsWith('.png')).toBe(true)
})

it('writes an upload under the state directory, one folder per day, and reports where it went', async () => {
  const dir = await state()
  const day = new Date('2026-11-25T10:00:00.000Z')
  const saved = await saveUpload(dir, { name: '截图.png', data: b64('png bytes') }, day)
  expect(saved.name).toBe('截图.png')
  expect(saved.bytes).toBe(9)
  expect(saved.path).toBe(join(dir, 'asks', '2026-11-25', saved.path.split('/').pop()!))
  expect(isUploaded(dir, saved.path)).toBe(true)
  expect(await readFile(saved.path, 'utf8')).toBe('png bytes')
  // The stored name carries a random prefix, so two uploads of one name are two files.
  const again = await saveUpload(dir, { name: '截图.png', data: b64('other') }, day)
  expect(again.path).not.toBe(saved.path)
  expect(await hasUploads(dir)).toBe(true)
  // A data URL prefix, as a pasted image sometimes carries, is accepted.
  const pasted = await saveUpload(dir, { name: 'p.png', data: `data:image/png;base64,${b64('x')}` }, day)
  expect(await readFile(pasted.path, 'utf8')).toBe('x')
})

it('refuses a body it cannot store, and writes nothing when it does', async () => {
  const dir = await state()
  await expect(saveUpload(dir, { name: 'a', data: '' })).rejects.toBeInstanceOf(UploadError)
  await expect(saveUpload(dir, { name: 'a', data: 'not base64!' })).rejects.toBeInstanceOf(UploadError)
  await expect(saveUpload(dir, { name: 'a', data: b64('') })).rejects.toBeInstanceOf(UploadError)
  // One byte over the cap is refused before anything is created.
  const over = Buffer.alloc(12 * 1024 * 1024 + 1, 0x61)
  await expect(saveUpload(dir, { name: 'big.bin', data: over.toString('base64') })).rejects.toThrow(/exceeds/)
  expect(await hasUploads(dir)).toBe(false)
})

it('accepts a path only when it is a file this Host wrote', async () => {
  const dir = await state()
  const saved = await saveUpload(dir, { name: 'a.txt', data: b64('a') })
  expect(uploadedOnly(dir, [saved.path])).toEqual([saved.path])
  // Anything else is refused: a file elsewhere on the machine, a sibling of the uploads folder whose name merely starts the same,
  // and a path that climbs out of it.
  const outside = [
    '/etc/passwd',
    join(dir, 'empty-state.log'),
    join(dir, 'asks-other', 'x.txt'),
    join(dir, 'asks', '..', '..', 'elsewhere'),
    join(dir, 'asks', '2026-11-25', '..', '..', '..', 'x'),
  ]
  await writeFile(join(dir, 'empty-state.log'), 'not an upload')
  for (const path of outside) {
    expect(isUploaded(dir, path)).toBe(false)
    expect(() => uploadedOnly(dir, [path])).toThrow(/Not a file uploaded/)
  }
  // The folder itself is not a file.
  expect(() => uploadedOnly(dir, [join(dir, 'asks')])).not.toThrow()
})

it('names the files in the message so the main Session knows to open them', () => {
  expect(filesNote([])).toBe('')
  expect(filesNote(['/s/a.png'])).toBe('[files · read before answering]\n- /s/a.png')
  expect(filesNote(['/s/a.png', '/s/b.txt'])).toBe('[files · read before answering]\n- /s/a.png\n- /s/b.txt')
})

it('keeps recent uploads and removes the folders past the retention', async () => {
  const dir = await state()
  const now = new Date('2026-11-25T10:00:00.000Z')
  const old = await saveUpload(dir, { name: 'old.txt', data: b64('o') }, new Date(now.getTime() - (UPLOAD_KEEP_DAYS + 2) * 86400000))
  await saveUpload(dir, { name: 'new.txt', data: b64('n') }, now)
  // The upload after it prunes the older folder; the file itself is gone with it.
  await expect(stat(old.path)).rejects.toThrow()
  const days = await readdir(join(dir, 'asks'))
  expect(days).toEqual(['2026-11-25'])
})

type Handler = (req: unknown, res: unknown) => Promise<void>
/** Mount the management routes on a fake web server, as `tests/tasks.spec.ts` does. */
function serve(runtime: Partial<Record<keyof HttpHost, unknown>>) {
  let handler: Handler = async () => {}
  const ctx = { webServer: { host: '127.0.0.1', port: 3082, register: (route: { handler: Handler }) => { handler = route.handler; return () => {} } } }
  registerHttp(ctx as never, { ready: Promise.resolve(), ...runtime } as unknown as HttpHost)
  return async (method: string, path: string, body?: unknown) => {
    let status = 0, text = ''
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    const req = { method, url: `/orchestrator/api/${path}`, headers: { host: '127.0.0.1:3082', 'x-orchestrator-request': '1' },
      async *[Symbol.asyncIterator]() { yield* chunks } }
    await handler(req, { writeHead: (code: number) => { status = code }, end: (data: string) => { text = data } })
    return { status, body: JSON.parse(text) as Record<string, unknown> }
  }
}

const ticket = (id: string, title: string): Ticket => ({ id, title, state: 'open' } as unknown as Ticket)

it('stores an upload, then names it in the question it carries to the main Session', async () => {
  const dir = await state()
  const ask = vi.fn(), stored = ticket('abc', '修复登录')
  const call = serve({ masterId: 'master', machine: { stateDir: dir } as never,
    store: { tickets: { open: () => [stored], get: (id: string) => id === 'abc' ? stored : undefined }, settings: () => ({ paused: false, executor: { maxWorkers: 3 } }) },
    executor: { running: () => false }, sessions: { active: () => false, todoList: () => undefined, conversation: () => [], ask } })
  const uploaded = await call('POST', 'uploads', { name: '截图.png', data: b64('png bytes') })
  expect(uploaded.status).toBe(200)
  const path = uploaded.body.path as string
  expect(path).toMatch(/\/asks\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-截图\.png$/)
  expect(await readFile(path, 'utf8')).toBe('png bytes')
  const asked = await call('POST', 'tasks/abc/ask', { question: '这张图里是什么？', files: [path] })
  expect(asked).toEqual({ status: 200, body: { delivered: 'queued' } })
  const [requestId, text, question, files] = ask.mock.calls[0]! as [string, string, string, string[]]
  expect(requestId).toMatch(/^ask:abc:\d+$/)
  expect(text).toBe(`${operatorQuestion('abc', '修复登录', '这张图里是什么？')}\n\n${filesNote([path])}`)
  // The canvas shows the operator's own words, not the frame around them.
  expect(question).toBe('这张图里是什么？')
  expect(files).toEqual([path])
  // A path the Host did not write is refused and carries nothing.
  const foreign = await call('POST', 'tasks/abc/ask', { question: '看看这个', files: ['/etc/passwd'] })
  expect(foreign.status).toBe(400)
  expect((foreign.body as { code?: string }).code).toBe('foreign')
  expect(ask).toHaveBeenCalledOnce()
})

it('says something to the main Session with no ticket behind it, with or without files', async () => {
  const dir = await state()
  const say = vi.fn()
  const call = serve({ masterId: 'master', machine: { stateDir: dir } as never,
    store: { tickets: { open: () => [], get: () => undefined }, settings: () => ({ paused: false, executor: { maxWorkers: 3 } }) },
    executor: { running: () => false }, sessions: { active: () => false, todoList: () => undefined, conversation: () => [], say } })
  const plain = await call('POST', 'session/say', { text: '  在当前工作区补一段 README  ' })
  expect(plain).toEqual({ status: 200, body: { delivered: 'queued' } })
  const [requestId, text, said] = say.mock.calls[0]! as [string, string, string]
  expect(requestId).toMatch(/^say:\d+$/)
  // No ticket line: this message opens no ticket on its own, which is the main Session's decision.
  expect(text).toBe('在当前工作区补一段 README')
  expect(said).toBe('在当前工作区补一段 README')
  // With a file, the same message carries the note; the question is unchanged for the canvas to show.
  const uploaded = await call('POST', 'uploads', { name: 'note.txt', data: b64('hello') })
  const withFile = await call('POST', 'session/say', { text: '看这个文件', files: [uploaded.body.path] })
  expect(withFile.status).toBe(200)
  const [, fileText, fileSaid, files] = say.mock.calls[1]! as [string, string, string, string[]]
  expect(fileText).toBe(`看这个文件\n\n${filesNote([uploaded.body.path as string])}`)
  expect(fileSaid).toBe('看这个文件')
  expect(files).toEqual([uploaded.body.path])
  // Blank text, a foreign path and too many files are all refused.
  expect((await call('POST', 'session/say', { text: '   ' })).status).toBe(400)
  expect((await call('POST', 'session/say', { text: 'x', files: ['/etc/hosts'] })).status).toBe(400)
  expect((await call('POST', 'session/say', { text: 'x', files: Array.from({ length: 9 }, () => uploaded.body.path) })).status).toBe(400)
  expect(say).toHaveBeenCalledTimes(2)
})

it('refuses an upload body it cannot store, with the reason', async () => {
  const dir = await state()
  const call = serve({ masterId: 'master', machine: { stateDir: dir } as never, sessions: {} })
  const empty = await call('POST', 'uploads', { name: 'a.txt', data: '' })
  expect(empty.status).toBe(400)
  const notBase64 = await call('POST', 'uploads', { name: 'a.txt', data: 'nope!' })
  expect(notBase64.status).toBe(400)
  const noName = await call('POST', 'uploads', { name: '', data: b64('x') })
  expect(noName.status).toBe(400)
  expect(await hasUploads(dir)).toBe(false)
})
