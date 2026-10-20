/**
 * The manager drawer's embedded official chat.
 *
 * This is the child slot declared by the drawer's `shell.overlay` entry. The
 * drawer wraps it in the slot-provided `SessionProvider` (bound to the retained
 * manager Session), so the component itself only has to render the official
 * Conversation content exactly as the subagent sidebar does: one
 * `conversation.content` occurrence in its `embedded` variant with a fixed
 * `views` selection, and a `conversation.session` render inside that view.
 *
 * Every type here is structural. The plugin cannot import the renderer's
 * declaration-merged slot map at runtime or build time, so only the members
 * this component calls are named; a renamed upstream contract degrades to the
 * localized fallback line instead of failing the plugin.
 */
import type { ReactElement, ReactNode } from 'react'
import type { Translate } from '../hooks.ts'

/** One selector hook over an observable snapshot. */
export type ManagerSnapshotHook<T> = <S>(selector: (value: T) => S) => S

/** The Session fields the embedded chat reads to pick a content phase. */
export interface ManagerChatSessionSnapshot {
  blank: boolean
  awaitingFirstTurn: boolean
  running: boolean
}

/** The Conversation assembly fields the embedded chat reads. */
export interface ManagerChatConversationSnapshot {
  activeTargets: { readonly size: number }
}

/** One row of the sessions list snapshot, as far as blankness is concerned. */
export interface ManagerChatSessionSummary {
  blank?: boolean | undefined
}

/** The sessions list snapshot. */
export interface ManagerChatSessionsSnapshot {
  byId: Readonly<Record<string, ManagerChatSessionSummary | undefined>>
}

/**
 * Props the Conversation factory hands its selected `views` component. Only
 * the child-slot renderer is used.
 */
export interface ManagerChatViewsProps {
  renderSlot?: ((key: string, owner: { view: 'chat' }) => ReactNode) | undefined
}

/** Caller-selected content view used for the embedded occurrence. */
export type ManagerChatViewsComponent = (props: ManagerChatViewsProps) => ReactNode

/** Options of one `renderFactorySlot` occurrence. */
export interface ManagerChatFactoryOptions {
  slots?: Readonly<Record<string, unknown>> | undefined
  fallback?: ReactNode
}

/** The factory renderer the slot framework supplies to every entry component. */
export type ManagerRenderFactorySlot = (
  name: string,
  props: {
    variant: 'embedded'
    phase: 'settling' | 'hero' | 'active'
    hero: boolean
  },
  options?: ManagerChatFactoryOptions,
) => ReactNode

/** Props supplied to the registered child slot component. */
export interface ManagerChatProps {
  /** Current Session id; the child slot is declared with session scope. */
  sessionId: string
  useSession: ManagerSnapshotHook<ManagerChatSessionSnapshot>
  useConversation: ManagerSnapshotHook<ManagerChatConversationSnapshot>
  useSessions: ManagerSnapshotHook<ManagerChatSessionsSnapshot>
  renderFactorySlot?: ManagerRenderFactorySlot | undefined
  /** Unused by this component; kept structural for the declared session scope. */
  renderSlot?: ((key: string, owner: object) => ReactNode) | undefined
  /** Dictionary-bound translator from the entry's declared locale. */
  t: Translate
}

/**
 * Fixed content view for an embedded Conversation: the official chat transcript,
 * with no view switcher.
 * @param props - factory-local props carrying the child-slot renderer.
 * @returns the chat transcript, or null when the renderer is unavailable.
 */
export function ManagerFixedChatView({ renderSlot }: ManagerChatViewsProps): ReactElement | null {
  if (typeof renderSlot !== 'function') return null
  return <>{renderSlot('conversation.session', { view: 'chat' })}</>
}

/**
 * Render the manager Session through the official Conversation content.
 * @param props - session-scope slot props.
 * @returns the embedded chat, or a localized fallback when the factory is absent.
 */
export function ManagerChatPanel(props: ManagerChatProps): ReactElement {
  const { sessionId, useSession, useConversation, useSessions, renderFactorySlot, t } = props
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const summary = useSessions(state => state.byId[sessionId])
  const active = conversation.activeTargets.size > 0
    || (session.blank !== true && session.awaitingFirstTurn !== true)
    || session.running === true
    || summary?.blank === false
  const hero = !active
  if (typeof renderFactorySlot !== 'function') {
    return <div className="sb-manager-notice" role="status">{t('manager.chatUnavailable')}</div>
  }
  return (
    <>
      {renderFactorySlot(
        'conversation.content',
        { variant: 'embedded', phase: hero ? 'hero' : 'active', hero },
        {
          slots: { views: ManagerFixedChatView },
          fallback: <div className="sb-manager-notice" role="status">{t('manager.chatUnavailable')}</div>,
        },
      )}
    </>
  )
}
