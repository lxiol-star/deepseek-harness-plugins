/**
 * Minimal structural view of the DeepSeek Harness (DSH) Host APIs this plugin
 * touches. The plugin ships bundled and does not import DSH packages at
 * runtime, so these declarations are the compile-time contract only.
 */

export interface TextBlock {
  type: 'text'
  text: string
}

export interface UserMessage {
  id: string
  role: 'user'
  content: TextBlock[]
  source: { kind: string; [key: string]: unknown }
}

export interface SessionEvent {
  type: string
  data?: unknown
  seq?: number
}

export interface SessionHeader {
  id?: string
  cwd?: string
  parentSession?: string
  origin?: string
  agentPreset?: string
}

export interface Session {
  id: string
  header: SessionHeader
  snapshotEvents(): readonly SessionEvent[]
  events?: readonly SessionEvent[]
  append(type: string, data: unknown): unknown
}

export interface Agent {
  id: string
  status: 'idle' | 'running'
  session: Session
  model?: { current(): { provider?: string; model?: string; reasoningEffort?: string } | undefined }
  /** Agent-scoped Cordis context (registrations here unwind on disposal). */
  ctx: any
  steer(message: UserMessage): void
  followup(message: UserMessage): void
  inject(message: UserMessage): void
  whenIdle(): Promise<void>
}

export interface ToolRunContext {
  readonly name: string
  readonly callId: string
  readonly arguments: unknown
  readonly agent?: Agent
  readonly signal: AbortSignal
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: any): TextBlock[]
  }
  execute(args: any, exec: ToolRunContext): Promise<unknown>
}

export interface CommandInvocation {
  readonly commandId: string
  readonly agent: Agent
  readonly rawInput: string
}

export interface CommandResult {
  kind: 'success' | 'error'
  text?: string
}

export interface PromptSection {
  name: string
  order: number
  text: string | ((context: { agent?: Agent; scope?: unknown }) => string)
  interpolate?: boolean
}

export interface ToolGuardExecution {
  readonly name: string
  readonly arguments: unknown
  readonly agent?: Agent
}

export interface Context {
  readonly tools: {
    register(definition: ToolDefinition, options?: { when?: (context: { agent: Agent; modelSelection?: unknown; signal?: AbortSignal }) => boolean | Promise<boolean> }): () => void
    get(name: string, scope?: unknown): ToolDefinition | undefined
    restrict(filter: { allow?: string[]; deny?: string[] }): () => void
    guard(guard: (execution: ToolGuardExecution) => string | undefined): () => void
  }
  readonly systemPrompt: {
    section(section: PromptSection): () => void
    getSectionOrder(name: string): number
  }
  readonly agents: {
    get(id: string): Agent | undefined
    list(): readonly Agent[]
  }
  readonly subagents?: {
    startActivation(spec: Record<string, unknown>): Promise<{
      childId: string
      name: string
      result: Promise<unknown>
      dispose(): Promise<void>
    }>
    sendMessage(sender: Agent, targetId: string, content: TextBlock[], options: { signal: AbortSignal }): Promise<string>
    interrupt?(targetSessionId: string, authority: { kind: 'ancestor'; agent: Agent }): void
  }
  readonly webServer?: {
    register(route: Record<string, unknown>): () => void
  }
  readonly commands?: {
    register(definition: Record<string, unknown>): () => void
  }
  on(event: string, listener: (...args: any[]) => any): () => void
  inject(services: string[], callback: (ctx: Context) => void): { dispose(): Promise<void> } & PromiseLike<unknown>
  effect(register: () => (() => void) | void, label?: string): () => void
  get(name: string): any
  logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}
