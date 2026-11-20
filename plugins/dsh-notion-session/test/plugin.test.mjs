import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../lib/index.js'

function mockContext() {
  const listeners = new Map()
  const effects = []
  const routes = []
  const skills = []
  const tools = []
  const ctx = {
    sessionController: {}, sessionQuery: {}, agents: {},
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    skills: { register(skill) { skills.push(skill); return () => {} } },
    logger: { warn() {} },
    effect(register) { effects.push(register); return register() },
    on(name, listener) { listeners.set(name, listener); return () => {} },
  }
  return { ctx, listeners, effects, routes, skills, tools }
}

test('apply owns the API, runtime skills and per-agent tool registrations', async () => {
  const { ctx, listeners, routes, skills, tools } = mockContext()
  const dispose = apply(ctx, { autoSync: false })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/api/notion-session')
  assert.deepEqual(routes[0].methods, ['GET', 'POST'])
  assert.deepEqual(skills.map(skill => skill.name).sort(), ['notion-session-archive', 'notion-session-resume', 'notion-session-save'])
  assert.ok(skills.every(skill => skill.invocation.userInvocable && skill.invocation.modelInvocable))
  assert.ok(skills.every(skill => !skill.content.includes('{{PLUGIN_DIR}}')))
  const agent = { id: 'session-1', ctx: { tools: { register(tool) { tools.push(tool); return () => {} } } } }
  listeners.get('agent/created')({ agent })
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'notion_session')
  assert.deepEqual(tools[0].parameters.required, ['action'])
  assert.ok(!tools[0].parameters.properties.action.enum.includes('resume'))
  assert.equal(tools[0].output.schema.type, 'object')
  assert.equal(tools[0].output.render({}, { ok: true })[0].text, '{\"ok\":true}')
  listeners.get('agent/disposed')({ agent })
  dispose()
})
