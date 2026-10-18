import { describe, expect, it, vi } from 'vitest'
import { BoardModel, type BoardModelJobs } from '../src/client/model.ts'
import { CleanupStack } from '../src/client/lifecycle.ts'
import type { Source, SessionListState, JobsSnapshot } from '../src/client/dsh.ts'
import { EMPTY_FEED } from '../src/shared/types.ts'

function source<T>(value: T): Source<T> & { publish(): void; count(): number } {
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback) }, publish: () => { for (const fn of [...listeners]) fn() }, count: () => listeners.size }
}
const list: SessionListState = { ids: ['id'], byId: { id: { id: 'id', displayTitle: 'id', running: true, blank: false, updatedAt: 0 } } }
const make = (jobs?: object) => {
  const sessions = source(list), status = source(new Map()), feed = source({ feed: EMPTY_FEED, online: false, receivedAt: 0 })
  const options = { sessions: { list: sessions }, uiSession: { sessionStatus: status }, feed, document: null, timers: { setInterval: vi.fn(), clearInterval: vi.fn() } }
  const model = new BoardModel({ ...options, ...(jobs ? { jobs: jobs as BoardModelJobs } : {}) })
  return { model, sessions, status, feed }
}

describe('startup rollback', () => {
  it('cleans every resource in reverse even when one release fails', () => {
    const stack = new CleanupStack(), calls: number[] = []
    stack.add(() => calls.push(1)); stack.add(() => { calls.push(2); throw new Error('close') }); stack.add(() => calls.push(3))
    stack.dispose(); stack.dispose()
    expect(calls).toEqual([3, 2, 1])
  })
  it('does not recursively register synchronous watchRows publications', async () => {
    const state = source<JobsSnapshot>({ rows: {} })
    const release = vi.fn()
    const watchRows = vi.fn(() => { state.publish(); return release })
    const { model } = make({ state, watchRows })
    model.start(); await Promise.resolve()
    expect(watchRows).toHaveBeenCalledTimes(1)
    model.dispose(); expect(release).toHaveBeenCalledTimes(1)
  })
  it('rolls back subscriptions if a source throws during start', () => {
    const { model, sessions, status, feed } = make()
    sessions.getSnapshot = () => { throw new Error('broken source') }
    expect(() => model.start()).toThrow('broken source')
    expect([sessions.count(), status.count(), feed.count()]).toEqual([0, 0, 0])
  })
  it('accepts unavailable optional jobs faces without breaking the panel', () => {
    expect(() => { const { model } = make({}); model.start(); model.dispose() }).not.toThrow()
  })
})
