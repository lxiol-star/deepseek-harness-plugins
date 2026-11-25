/**
 * Files the operator hands the main Session from a task view. A browser cannot put bytes into the main Session's composer from
 * another panel, so a file is uploaded here first: the Host writes it under its state directory, and the relay that carries the
 * operator's question names the absolute path. The main Session then opens a text file with `read` and an image with
 * `read_image`, which accepts PNG, JPEG, WebP and GIF.
 *
 * A path only ever comes back for a file this module wrote, and the routes that carry one to the main Session accept nothing
 * else: a browser that asked for `/etc/passwd` gets its own upload directory or an error, never the file.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'

/** Where uploads land under the state directory; each day gets its own folder, so a person can find and delete them. */
export const UPLOAD_DIR = 'asks'
/** The largest single file accepted, and the largest total one message may carry. */
export const UPLOAD_MAX = 12 * 1024 * 1024
export const UPLOAD_TOTAL = 24 * 1024 * 1024
/** Day folders older than this are removed when a new upload arrives; a file already named in a message is gone by then anyway. */
export const UPLOAD_KEEP_DAYS = 21
/** The longest file name kept from what the browser reports; the rest is cut so a path stays readable in a message. */
const NAME_MAX = 96
/** What a name keeps: anything that would break the path, the message line, or a shell is replaced by `-`. */
const UNSAFE = /[^\p{L}\p{N}._-]+/gu

/** One file the Host wrote, as the routes report it back and as a message names it. */
export interface Uploaded { path: string; name: string; bytes: number }

/** The name a file is stored under: its base name made safe, never empty, never longer than `NAME_MAX` including its extension. */
export function uploadName(reported: string): string {
  const base = basename(String(reported ?? '').replaceAll('\\', '/')).trim()
  const cleaned = base.replace(UNSAFE, '-').replace(/^[-.]+/, '').replace(/-+$/, '')
  if (cleaned.length === 0) return 'file'
  if (cleaned.length <= NAME_MAX) return cleaned
  // Keep the extension: a file read back by its name is easier to trust than one whose type has to be sniffed.
  const dot = cleaned.lastIndexOf('.')
  const tail = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : ''
  return cleaned.slice(0, NAME_MAX - tail.length) + tail
}

/** The folder a day's uploads go to under the state directory. */
export const uploadDir = (stateDir: string, day: string): string => join(resolve(stateDir), UPLOAD_DIR, day)

/**
 * Writes one uploaded file under the state directory and reports the absolute path it got.
 * @param stateDir - the orchestrator's state directory.
 * @param input - the reported name and the base64 body the browser sent.
 * @param now - the moment the upload arrives, which names its day folder.
 */
export async function saveUpload(stateDir: string, input: { name: string; data: string }, now = new Date()): Promise<Uploaded> {
  const bytes = decode(input.data)
  if (bytes.length === 0) throw new UploadError('empty', 'The file is empty')
  if (bytes.length > UPLOAD_MAX) throw new UploadError('tooLarge', `The file exceeds ${UPLOAD_MAX} bytes`)
  const day = now.toISOString().slice(0, 10)
  const dir = uploadDir(stateDir, day)
  await mkdir(dir, { recursive: true })
  // A random prefix keeps two uploads of the same name apart, and keeps a name from being guessed or replaced.
  const name = `${randomBytes(4).toString('hex')}-${uploadName(input.name)}`
  const path = join(dir, name)
  await writeFile(path, bytes, { flag: 'wx' })
  await prune(stateDir, now)
  return { path, name: uploadName(input.name), bytes: bytes.length }
}

/** Raised for a body this module refuses; `http.ts` reports its code as a 400 with the message. */
export class UploadError extends Error { constructor(readonly code: 'empty' | 'tooLarge' | 'notBase64' | 'foreign', message: string) { super(message) } }

/**
 * Whether `path` is a file this module wrote: it must resolve inside the uploads folder and not be a link out of it. A route
 * that carries paths to the main Session takes nothing but these.
 */
export function isUploaded(stateDir: string, path: string): boolean {
  const root = resolve(stateDir, UPLOAD_DIR)
  const target = resolve(path)
  if (target !== root && !target.startsWith(root + sep)) return false
  return true
}

/** Checks every path a route was handed and returns them unchanged, or raises for the first one it did not write. */
export function uploadedOnly(stateDir: string, paths: readonly string[]): string[] {
  for (const path of paths) {
    if (!isUploaded(stateDir, path)) throw new UploadError('foreign', `Not a file uploaded through this panel: ${path}`)
  }
  return [...paths]
}

/**
 * The lines that name the operator's files in a message to the main Session. The first line says what the paths are for, and
 * every path is absolute: the main Session opens them with `read` or, for an image, `read_image`.
 */
export function filesNote(paths: readonly string[]): string {
  if (paths.length === 0) return ''
  const lines = paths.map(path => `- ${path}`).join('\n')
  return `[files · read before answering]\n${lines}`
}

/**
 * Removes day folders older than `UPLOAD_KEEP_DAYS`, best effort: a folder that cannot be read or removed stays, because a failed
 * cleanup must not fail the upload the operator is waiting for.
 */
async function prune(stateDir: string, now: Date): Promise<void> {
  const root = resolve(stateDir, UPLOAD_DIR)
  const cutoff = new Date(now.getTime() - UPLOAD_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  let days: string[]
  try { days = await readdir(root) } catch { return }
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= cutoff) continue
    try { await rm(join(root, day), { recursive: true, force: true }) } catch { /* keep it for the next upload to try */ }
  }
}

/** The bytes of a base64 body; a body that does not decode is refused rather than written as garbage. */
function decode(data: string): Buffer {
  const text = String(data ?? '').replace(/^data:[^,]*,/, '')
  if (text.length === 0 || !/^[A-Za-z0-9+/=\s]+$/.test(text)) throw new UploadError('notBase64', 'The file body is not base64')
  const bytes = Buffer.from(text, 'base64')
  if (bytes.length === 0) throw new UploadError('notBase64', 'The file body is not base64')
  return bytes
}

/** Whether a state directory holds at least one uploaded file, for tests and diagnostics. */
export async function hasUploads(stateDir: string): Promise<boolean> {
  const root = resolve(stateDir, UPLOAD_DIR)
  try { const days = await readdir(root); return days.length > 0 && (await stat(root)).isDirectory() } catch { return false }
}
