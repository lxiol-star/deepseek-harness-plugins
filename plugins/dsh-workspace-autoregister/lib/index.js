/**
 * Host half of dsh-workspace-autoregister.
 *
 * A conversation that scaffolds a new Workspace directory (for example the
 * user-level `workspace-create` skill: `AGENTS.md` + `README.md` + `plans/` +
 * `reports/`) cannot add that directory to the Workspace list. This plugin
 * observes successful tool calls, recognizes such a directory on disk, and
 * registers it through the authoritative `ctx.workspaceRegistry`, whose feed
 * updates every open sidebar live.
 *
 * Registration is idempotent: an already registered directory is left alone.
 * A newly registered Workspace gets its first blank Session through
 * `ctx.sessionController.create({ workspaceId })` — the same call the GUI's
 * add-workspace flow makes — so the new row is usable immediately and is not
 * treated as empty by filters that hide empty Workspaces.
 *
 * @module dsh-workspace-autoregister
 */

import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Git inspection timeout; a slow/missing git must not delay registration. */
const GIT_TIMEOUT_MS = 2_500

/** Plugin name registered with the Loader. */
export const name = 'workspace-autoregister'

/** The authoritative Workspace registry is the only required service. */
export const inject = ['workspaceRegistry']

/** Deployment-varying defaults; every field is settable from `cordis.patch.yml`. */
const DEFAULT_CONFIG = {
  enabled: true,
  promptFiles: ['AGENTS.md', 'AGENTS.local.md'],
  requiredFiles: ['README.md'],
  requiredDirectories: ['plans', 'reports'],
  createSession: true,
  skipSessionDirectory: true,
  scanAncestors: 3,
  registerProjectRoot: true,
  sendHandoff: true,
  handoffFile: 'HANDOFF.md',
  handoffMaxBytes: 32768,
}

/** Config fields that name workspace signature entries. */
const CONFIG_NAME_FIELDS = ['promptFiles', 'requiredFiles', 'requiredDirectories']

/** Maximum candidate paths extracted from one tool call. */
const MAX_CANDIDATES = 32
/** Maximum directories whose signature is checked for one tool call. */
const MAX_DIRECTORIES = 32
/** Maximum inspected string length; long file bodies are not path sources. */
const MAX_STRING_LENGTH = 32 * 1024
/** Longest accepted candidate path. */
const MAX_PATH_LENGTH = 4096
/** Strings visited per tool call while collecting candidates. */
const MAX_VISITED_STRINGS = 4000

/**
 * Absolute-path token in free text: one or more `/segment` groups, limited to
 * characters that appear in real paths and are not shell, JSON, or URL syntax.
 */
const ABSOLUTE_PATH_TOKEN = /\/(?:[^\s/'"`;|&<>(){}$*?\\:,\n\r\t]+[/]?)+/gu

/**
 * A Cordis `Config` schema in Standard Schema form. It keeps this package free
 * of runtime dependencies while still validating `cordis.patch.yml` values at
 * activation.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-workspace-autoregister',
    /**
     * Validate one raw row config and fill deployment defaults.
     * @param value - raw `config` value from the Loader row.
     * @returns the complete config, or Standard Schema issues.
     */
    validate(value) {
      const input = value === undefined || value === null ? {} : value
      if (typeof input !== 'object' || Array.isArray(input)) {
        return { issues: [{ message: 'config must be an object', path: [] }] }
      }
      const config = {
        ...DEFAULT_CONFIG,
        promptFiles: [...DEFAULT_CONFIG.promptFiles],
        requiredFiles: [...DEFAULT_CONFIG.requiredFiles],
        requiredDirectories: [...DEFAULT_CONFIG.requiredDirectories],
      }
      const issues = []
      const knownFields = new Set(['enabled', 'createSession', 'skipSessionDirectory', 'scanAncestors', 'registerProjectRoot', 'sendHandoff', 'handoffFile', 'handoffMaxBytes', ...CONFIG_NAME_FIELDS])
      for (const key of Object.keys(input)) {
        if (!knownFields.has(key)) issues.push({ message: `unknown config field '${key}'`, path: [key] })
      }
      if ('enabled' in input) {
        if (typeof input.enabled !== 'boolean') issues.push({ message: 'enabled must be a boolean', path: ['enabled'] })
        else config.enabled = input.enabled
      }
      if ('createSession' in input) {
        if (typeof input.createSession !== 'boolean') {
          issues.push({ message: 'createSession must be a boolean', path: ['createSession'] })
        } else config.createSession = input.createSession
      }
      if ('skipSessionDirectory' in input) {
        if (typeof input.skipSessionDirectory !== 'boolean') {
          issues.push({ message: 'skipSessionDirectory must be a boolean', path: ['skipSessionDirectory'] })
        } else config.skipSessionDirectory = input.skipSessionDirectory
      }
      if ('registerProjectRoot' in input) {
        if (typeof input.registerProjectRoot !== 'boolean') {
          issues.push({ message: 'registerProjectRoot must be a boolean', path: ['registerProjectRoot'] })
        } else config.registerProjectRoot = input.registerProjectRoot
      }
      if ('scanAncestors' in input) {
        const ancestors = input.scanAncestors
        if (!Number.isInteger(ancestors) || ancestors < 0 || ancestors > 8) {
          issues.push({ message: 'scanAncestors must be an integer between 0 and 8', path: ['scanAncestors'] })
        } else config.scanAncestors = ancestors
      }
      if ('sendHandoff' in input) {
        if (typeof input.sendHandoff !== 'boolean') {
          issues.push({ message: 'sendHandoff must be a boolean', path: ['sendHandoff'] })
        } else config.sendHandoff = input.sendHandoff
      }
      if ('handoffFile' in input) {
        const file = input.handoffFile
        const isPlainName = typeof file === 'string' && file !== '' && file !== '.' && file !== '..'
          && !file.includes('/') && !file.includes('\\')
        if (!isPlainName) {
          issues.push({ message: 'handoffFile must be a plain file name inside the Workspace', path: ['handoffFile'] })
        } else config.handoffFile = file
      }
      if ('handoffMaxBytes' in input) {
        const limit = input.handoffMaxBytes
        if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
          issues.push({ message: 'handoffMaxBytes must be an integer between 1 and 1000000', path: ['handoffMaxBytes'] })
        } else config.handoffMaxBytes = limit
      }
      for (const field of CONFIG_NAME_FIELDS) {
        if (!(field in input)) continue
        const names = input[field]
        if (!Array.isArray(names) || !names.every(entry => typeof entry === 'string' && entry !== '')) {
          issues.push({ message: `${field} must be an array of non-empty strings`, path: [field] })
        } else config[field] = [...names]
      }
      return issues.length > 0 ? { issues } : { value: config }
    },
  },
}

/**
 * Collect absolute path tokens from one tool call's arguments.
 *
 * Only successful tool calls are scanned, so arguments are ordinary
 * model-authored JSON: strings that are absolute paths and absolute path
 * tokens embedded in commands are the two sources. The walk is bounded so a
 * large file body cannot turn one tool result into unbounded filesystem work.
 *
 * @param args - losslessly snapshotted model arguments of the settled call.
 * @returns unique absolute path candidates in discovery order.
 * @internal
 */
export function collectPathCandidates(args) {
  const candidates = []
  const seen = new Set()
  let visited = 0

  const consider = (token) => {
    if (candidates.length >= MAX_CANDIDATES) return
    if (token.length === 0 || token.length > MAX_PATH_LENGTH) return
    if (!isAbsolute(token) || token.includes('\0')) return
    if (seen.has(token)) return
    seen.add(token)
    candidates.push(token)
  }

  const visit = (value) => {
    if (candidates.length >= MAX_CANDIDATES || visited > MAX_VISITED_STRINGS) return
    if (typeof value === 'string') {
      visited += 1
      if (value.length > MAX_STRING_LENGTH) return
      if (value.startsWith('/')) consider(value.trim())
      if (!value.includes('/')) return
      for (const match of value.matchAll(ABSOLUTE_PATH_TOKEN)) consider(match[0])
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry)
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const entry of Object.values(value)) visit(entry)
    }
  }

  visit(args)
  return candidates
}

/**
 * Directories to test for one candidate, the candidate first.
 * @param candidate - absolute path token from a tool call.
 * @param levels - ancestor levels to include.
 * @returns candidate followed by its ancestors, excluding the filesystem root.
 * @internal
 */
export function candidateDirectories(candidate, levels) {
  const directories = []
  let current = candidate
  for (let level = 0; level <= levels; level += 1) {
    if (current === '/' || current.length === 0) break
    directories.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return directories
}

/**
 * Report whether a directory carries the configured Workspace signature.
 *
 * The signature is a directory listing, never file content: at least one
 * prompt file, every required file, and every required directory.
 *
 * @param directory - absolute directory to inspect.
 * @param config - resolved plugin config.
 * @returns `true` when the entry set matches the signature.
 * @internal
 */
export async function matchesWorkspaceSignature(directory, config) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return false
  }
  const files = new Set()
  const directories = new Set()
  for (const entry of entries) {
    if (entry.isDirectory()) directories.add(entry.name)
    else files.add(entry.name)
  }
  if (!config.promptFiles.some(promptFile => files.has(promptFile))) return false
  if (!config.requiredFiles.every(file => files.has(file))) return false
  return config.requiredDirectories.every(entry => directories.has(entry))
}

/**
 * Resolve and validate the row config, filling deployment defaults.
 *
 * The Loader already validates through {@link Config}; this second pass keeps a
 * direct or programmatic activation honest instead of silently accepting
 * mistyped booleans and names.
 *
 * @param config - raw config, or `undefined` for a direct activation.
 * @returns the complete config.
 * @throws when the config violates the schema; activation then fails loudly.
 */
function resolveConfig(config) {
  const result = Config['~standard'].validate(config)
  if (result.issues !== undefined) {
    const detail = result.issues
      .map(issue => issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`dsh-workspace-autoregister: invalid config: ${detail}`)
  }
  return result.value
}

/**
 * Read the Workspace's handoff prompt, the entry a scaffolding Session leaves
 * for the first Session of a newly registered Workspace.
 *
 * @param workspacePath - absolute Workspace directory.
 * @param settings - resolved plugin config.
 * @returns the prompt text, or `undefined` when the file is missing or blank.
 */
async function readHandoff(workspacePath, settings) {
  let text
  try {
    text = await readFile(join(workspacePath, settings.handoffFile), 'utf8')
  } catch {
    return undefined
  }
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const body = trimmed.length > settings.handoffMaxBytes
    ? `${trimmed.slice(0, settings.handoffMaxBytes)}\n\n（交接提示词已截断）`
    : trimmed
  return `（工作区交接提示词，来自 ${settings.handoffFile}）\n\n${body}`
}

/**
 * Find the main checkout that owns a nested git worktree.
 *
 * A worktree created under its repository (e.g. `<repo>/.worktrees/<branch>`)
 * shares the main checkout's `--git-common-dir`; the parent path is what the
 * native sidebar's "Workspace Tree" grouping needs to nest the branch under
 * the project. A sibling worktree (`../repo-branch`) has the same common dir
 * but no path prefix, so it returns undefined and is left alone.
 *
 * @param directory - a Workspace-shaped directory.
 * @returns the main checkout root, or undefined when not nested in one.
 */
export async function nestedProjectRoot(directory) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', directory, 'rev-parse', '--git-common-dir'], {
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    })
    const raw = stdout.trim()
    if (raw === '') return undefined
    const common = resolve(await realpath(directory), raw)
    if (basename(common) !== '.git') return undefined
    const root = dirname(common)
    const canonical = await realpath(directory).catch(() => directory)
    if (root === canonical || root === '/' || root === '') return undefined
    const rel = relative(root, canonical)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined
    const info = await stat(root)
    return info.isDirectory() ? root : undefined
  } catch {
    return undefined
  }
}

/**
 * Install the workspace scanner on the Host context.
 * @param ctx - plugin context carrying `workspaceRegistry` and, when composed, `sessionController`.
 * @param config - validated row config; defaults apply when omitted.
 */
export function apply(ctx, config) {
  const settings = resolveConfig(config)
  if (settings.enabled !== true) return

  const registry = ctx.workspaceRegistry
  /** Canonical paths already registered or resolved as registered. */
  const known = new Set()
  /** Serializes registrations so one directory never creates two first Sessions. */
  let registrationTail = Promise.resolve()
  /** Set when the fiber starts unwinding: no further durable side effects. */
  let disposed = false
  ctx.effect(() => () => {
    disposed = true
  }, 'workspace-autoregister: dispose')

  const warn = (message, error) => {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    ctx.logger.warn('dsh-workspace-autoregister: %s (%s)', message, detail)
  }

  /** The directory the calling Session currently runs in, when known. */
  const sessionDirectory = (exec) => {
    const agent = exec.agent
    if (agent === undefined) return undefined
    const workingDirectory = ctx.get('workingDirectory')
    if (workingDirectory !== undefined) {
      try {
        return workingDirectory.get(agent.session)
      } catch {
        return undefined
      }
    }
    return agent.session.header.cwd
  }

  /**
   * Create the Workspace's first blank Session exactly like the GUI's
   * add-workspace flow, so the row is not empty and is ready to prompt.
   * @param workspace - freshly registered Workspace entity.
   */
  const createFirstSession = async (workspace) => {
    if (disposed || settings.createSession !== true) return
    const sessions = ctx.get('sessionController')
    if (sessions === undefined) return
    let created
    try {
      created = await sessions.create({ workspaceId: workspace.id })
    } catch (error) {
      warn(`workspace ${workspace.path} was added but its first Session could not be created`, error)
      return
    }
    if (disposed || settings.sendHandoff !== true) return
    const handoff = await readHandoff(workspace.path, settings)
    if (handoff === undefined) return
    try {
      await sessions.prompt({
        requestId: randomUUID(),
        sessionId: created.sessionId,
        mode: 'queue',
        content: [{ type: 'text', text: handoff }],
      }, AbortSignal.timeout(30_000))
      ctx.logger.info('dsh-workspace-autoregister: handed off %s into %s', settings.handoffFile, workspace.path)
    } catch (error) {
      warn(`workspace ${workspace.path} got its first Session but the handoff prompt was not accepted`, error)
    }
  }

  /**
   * Register the main checkout that encloses a nested worktree, so the native
   * Workspace Tree grouping can show the branch under its project. The root
   * gets no first Session: it is only a structural parent row.
   * @param directory - newly matched nested Workspace directory.
   */
  const registerProjectRoot = async (directory) => {
    if (settings.registerProjectRoot !== true || disposed) return
    const root = await nestedProjectRoot(directory)
    if (root === undefined || known.has(root)) return
    const existing = await registry.resolveByPath(root)
    if (existing !== undefined) {
      known.add(existing.path)
      known.add(root)
      return
    }
    const workspace = await registry.create(root)
    known.add(workspace.path)
    known.add(root)
    ctx.logger.info('dsh-workspace-autoregister: added project root workspace %s for %s', workspace.path, directory)
  }

  /**
   * Register one directory and prepare its first Session.
   *
   * `registry.create` silently reuses an existing record, so the Session is
   * only prepared when the record has no Session yet; a concurrent GUI
   * registration therefore does not gain a second blank Session.
   *
   * @param directory - signature-matching absolute directory.
   */
  const register = (directory) => {
    if (known.has(directory) || disposed) return registrationTail
    registrationTail = registrationTail.then(async () => {
      if (disposed) return
      const existing = await registry.resolveByPath(directory)
      if (existing !== undefined) {
        known.add(existing.path)
        known.add(directory)
        await registerProjectRoot(directory).catch(error => warn(`could not add project root for ${directory}`, error))
        return
      }
      const workspace = await registry.create(directory)
      known.add(workspace.path)
      known.add(directory)
      if (disposed) return
      ctx.logger.info('dsh-workspace-autoregister: added workspace %s', workspace.path)
      // Git probing is a subprocess; start it alongside the first Session so a
      // slow or missing git never delays making the new Workspace usable. The
      // structural parent row is best-effort and awaited only for ordering.
      const rootTask = registerProjectRoot(directory).catch(error => warn(`could not add project root for ${directory}`, error))
      if (workspace.sessionIds.length === 0) await createFirstSession(workspace)
      await rootTask
    }).catch(error => warn(`could not add workspace ${directory}`, error))
    return registrationTail
  }

  /**
   * Inspect the directories a settled tool call mentioned.
   * @param exec - settled tool execution.
   * @param result - its outcome; failed calls are ignored.
   */
  const inspect = async (exec, result) => {
    if (result.isError || disposed) return
    const candidates = collectPathCandidates(exec.arguments)
    if (candidates.length === 0) return
    const sessionCwd = settings.skipSessionDirectory ? sessionDirectory(exec) : undefined
    const normalizedSessionCwd = sessionCwd === undefined ? undefined : resolve(sessionCwd)
    const directories = new Set()
    for (const candidate of candidates) {
      for (const directory of candidateDirectories(candidate, settings.scanAncestors)) {
        if (directories.size >= MAX_DIRECTORIES) break
        if (normalizedSessionCwd !== undefined && resolve(directory) === normalizedSessionCwd) continue
        directories.add(directory)
      }
      if (directories.size >= MAX_DIRECTORIES) break
    }
    for (const directory of directories) {
      if (disposed || known.has(directory)) continue
      if (!(await matchesWorkspaceSignature(directory, settings))) continue
      await register(directory)
    }
  }

  ctx.on('tools/result', (exec, result) => {
    void inspect(exec, result).catch(error => warn('scan failed', error))
  })
}
