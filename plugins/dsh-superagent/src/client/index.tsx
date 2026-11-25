/** Browser plugin entry point registering the sidebar icons, the management panel, the task canvas, the task dock, and the Plugin Manager config view. */
import { useCallback, useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { PanelProvider } from './provider.tsx'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { openKnownSession, SessionNavigationError } from '../navigation.ts'
import { App } from './app.tsx'
import { CanvasPage } from './canvas.tsx'
import { TaskDock, type DockSlotProps } from './dock.tsx'
import { PluginConfig, usePageForm } from './deployment.tsx'
import { en, zh } from './locales.ts'
import type { T } from './text.ts'

type ClientContext = Context & { sessions: ISessions }
const NS = 'dshSuperagent'
const PANEL_ID = 'dsh-superagent' as MainPanelId
/** The task canvas, a main panel of its own beside the management panel. */
const CANVAS_ID = 'dsh-superagent-canvas' as MainPanelId
const ENTRY = 'dsh-superagent'
/** The entry's cell in `conversation.input.dock`, beside the shipped `queue`, `todo` and `goal` entries. */
const DOCK_ID = 'dsh-superagent'

function HammerIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3.5h9l3.5 1.75v2.5L15 9.5H6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" /><path d="M10 9.5v10.25a1.75 1.75 0 0 0 3.5 0V9.5" /><path d="M10 15.5h3.5" />
  </svg>
}

function CanvasIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="8" height="6" rx="1.5" /><rect x="13" y="14" width="8" height="6" rx="1.5" /><path d="M11 7h5.5a2 2 0 0 1 2 2V14" /><path d="M3 15.5h5" />
  </svg>
}

/**
 * Opens a DeepSeek Harness Session in the Workspace UI once the host's catalog lists it; a later request cancels the one
 * before it, and unmounting cancels the one in flight.
 */
function useOpenSession(ctx: ClientContext, t: T) {
  const pending = useRef<AbortController>(undefined)
  useEffect(() => () => { pending.current?.abort() }, [])
  return useCallback(async (id: string) => {
    pending.current?.abort()
    const request = new AbortController(); pending.current = request
    try {
      await openKnownSession(ctx.sessions, id as SessionId, target => { ctx.uiWorkspace.openSession(target) }, request.signal)
    } catch (error) {
      if (error instanceof SessionNavigationError) throw new Error(t(error.code === 'not-ready' ? 'sessionListNotReady' : 'sessionNotListed'))
      throw error
    }
  }, [ctx, t])
}

/** Mounted panel wrapper. */
function Mounted({ ctx, t }: { ctx: ClientContext; t: T }) {
  const openSession = useOpenSession(ctx, t)
  const form = usePageForm(ctx.get('configForms')?.get<Record<string, unknown>>(ENTRY))
  return <App t={t} openSession={openSession} deploymentForm={form} />
}

/** The task canvas panel; it shares the management panel's styles, polling and Session navigation. */
function MountedCanvas({ ctx, t }: { ctx: ClientContext; t: T }) {
  const openSession = useOpenSession(ctx, t)
  return <PanelProvider t={t} openSession={openSession}><CanvasPage /></PanelProvider>
}

/** The task dock of the main Session; its button opens the task canvas. Every composer prop the slot passes is handed on. */
function MountedDock(props: DockSlotProps & { ctx: ClientContext; t: T }) {
  const { ctx, t, sessionId, input, inputActions, useInput } = props
  const openSession = useOpenSession(ctx, t)
  const openPanel = useCallback(() => { ctx.get('layout')?.selectPanel(CANVAS_ID) }, [ctx])
  return <TaskDock t={t} sessionId={sessionId} input={input} inputActions={inputActions} useInput={useInput}
    openSession={openSession} openPanel={openPanel} />
}

export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace']
/** Registers the panel, the task canvas, the task dock, the sidebar icons, and the Plugin Manager config view; `configForms` and `layout` are optional. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-superagent: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({}) },
    (props: { t: T }) => <Mounted ctx={ctx} t={props.t} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel'), locale: NS }, HammerIcon))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: CANVAS_ID, locale: NS, inject: () => ({}) },
    (props: { t: T }) => <MountedCanvas ctx={ctx} t={props.t} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: CANVAS_ID, order: 11, label: () => t('canvas.title'), locale: NS }, CanvasIcon))
  // The dock waits for the conversation to declare its slot; it shows in the main Session alone.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: DOCK_ID, order: 10, locale: NS },
    (props: DockSlotProps & { t: T }) => <MountedDock ctx={ctx} {...props} />))
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: `${ENTRY}#${ENTRY}`, locale: NS },
    (props: PluginConfigViewProps & { t: T }) => <PluginConfig t={props.t} view={props.view} form={props.form} />))
}
