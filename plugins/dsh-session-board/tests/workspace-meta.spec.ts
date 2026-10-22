import { describe, expect, it, vi } from 'vitest'
import {
  normalizeRemote,
  parseWorkspaceMetaResponse,
  projectLabel,
  WORKSPACE_META_PATH,
} from '../src/shared/workspace-meta.ts'
import { createWorkspaceMetaRoute, type GitFacts, type WorkspaceGitProbe } from '../src/host/workspace-meta.ts'

/** Registry stub with two workspaces. */
function registry() {
  return {
    list: () => [
      { id: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw' },
      { id: 'wb', title: 'i-ai-gw-tpm', path: '/repo/i-ai-gw-tpm' },
      { id: 'wc', title: 'plain', path: '/repo/plain' },
    ],
  }
}

/** Probe stub with one git repository and one plain directory. */
function probeFactory() {
  const probe = vi.fn(async (path: string): Promise<GitFacts> => {
    if (path.endsWith('plain')) return {}
    return { root: path, branch: path.includes('i-ai-gw-tpm') ? 'feat/tpm' : 'feat/main', remote: 'git@git.zyql.com:it-eff-lab/i-ai-gw.git' }
  })
  return probe
}

describe('workspace remote normalization', () => {
  it('normalizes scp, ssh, https and trailing .git', () => {
    expect(normalizeRemote('git@github.com:lxiol-star/i-ai-gw.git')).toBe('github.com/lxiol-star/i-ai-gw')
    expect(normalizeRemote('ssh://git@git.zyql.com:2222/it-eff-lab/i-ai-gw.git')).toBe('git.zyql.com/it-eff-lab/i-ai-gw')
    expect(normalizeRemote('https://github.com/a/b.git/')).toBe('github.com/a/b')
    expect(normalizeRemote('')).toBe('')
  })

  it('labels the project with the repository name', () => {
    expect(projectLabel('git.zyql.com/it-eff-lab/i-ai-gw')).toBe('i-ai-gw')
    expect(projectLabel('github.com/a/b')).toBe('b')
  })

  it('parses the route payload defensively', () => {
    const payload = {
      ok: true, generatedAt: 5,
      workspaces: [{ workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main', projectKey: 'a/b/c', projectLabel: 'c' }],
    }
    expect(parseWorkspaceMetaResponse(payload)?.workspaces[0]).toMatchObject({ workspaceId: 'wa', branch: 'feat/main', projectLabel: 'c' })
    expect(parseWorkspaceMetaResponse({ ok: false })).toBeNull()
    expect(parseWorkspaceMetaResponse(null)).toBeNull()
  })
})

describe('workspace meta route', () => {
  /**
   * Build the route with an injectable clock and probe.
   * @param probe - git probe stub.
   * @param ttl - cache lifetime.
   * @returns route plus the mutable clock.
   */
  function setup(probe: WorkspaceGitProbe, ttl = 60_000) {
    const clock = { now: 1_000 }
    const warn = vi.fn()
    const route = createWorkspaceMetaRoute({ registry: registry(), warn, probe, ttlMs: ttl, now: () => clock.now })
    return { route, clock, warn }
  }

  /** GET the route and return the parsed body. */
  async function fetchRoute(route: ReturnType<typeof setup>['route']) {
    const response = await route.fetch(new Request(`http://board${WORKSPACE_META_PATH}`))
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }

  it('returns normalized project facts for every registered workspace', async () => {
    const probe = probeFactory()
    const { route } = setup(probe)
    const { status, body } = await fetchRoute(route)
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    const workspaces = body.workspaces as Array<Record<string, unknown>>
    expect(workspaces).toHaveLength(3)
    expect(workspaces[0]).toMatchObject({
      workspaceId: 'wa', title: 'i-ai-gw', branch: 'feat/main',
      projectKey: 'git.zyql.com/it-eff-lab/i-ai-gw', projectLabel: 'i-ai-gw',
    })
    expect(workspaces[2]).toMatchObject({ workspaceId: 'wc' })
    expect(workspaces[2]).not.toHaveProperty('projectKey')
  })

  it('caches git facts until the ttl expires', async () => {
    const probe = probeFactory()
    const { route, clock } = setup(probe)
    await fetchRoute(route)
    expect(probe).toHaveBeenCalledTimes(3)
    await fetchRoute(route)
    expect(probe).toHaveBeenCalledTimes(3)
    clock.now += 60_001
    await fetchRoute(route)
    expect(probe).toHaveBeenCalledTimes(6)
  })

  it('keeps the route available when one probe fails', async () => {
    const probe = vi.fn(async (path: string): Promise<GitFacts> => {
      if (path.includes('i-ai-gw-tpm')) throw new Error('git exploded')
      return {}
    })
    const { route, warn } = setup(probe)
    const { status, body } = await fetchRoute(route)
    expect(status).toBe(200)
    expect((body.workspaces as unknown[]).length).toBe(3)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('answers a contained 500 when the registry itself is broken', async () => {
    const route = createWorkspaceMetaRoute({
      registry: { list: () => { throw new Error('registry down') } },
      warn: vi.fn(),
    })
    const { status, body } = await fetchRoute(route)
    expect(status).toBe(500)
    expect(body.ok).toBe(false)
  })
})
