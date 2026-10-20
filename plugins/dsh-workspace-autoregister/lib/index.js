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

import { readdir } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

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
      const knownFields = new Set(['enabled', 'createSession', 'skipSessionDirectory', 'scanAncestors', ...CONFIG_NAME_FIELDS])
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
      if ('scanAncestors' in input) {
        const ancestors = input.scanAncestors
        if (!Number.isInteger(ancestors) || ancestors < 0 || ancestors > 8) {
          issues.push({ message: 'scanAncestors must be an integer between 0 and 8', path: ['scanAncestors'] })
        } else config.scanAncestors = ancestors
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
    try {
      await sessions.create({ workspaceId: workspace.id })
    } catch (error) {
      warn(`workspace ${workspace.path} was added but its first Session could not be created`, error)
    }
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
        return
      }
      const workspace = await registry.create(directory)
      known.add(workspace.path)
      known.add(directory)
      if (disposed) return
      ctx.logger.info('dsh-workspace-autoregister: added workspace %s', workspace.path)
      if (workspace.sessionIds.length > 0) return
      await createFirstSession(workspace)
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
