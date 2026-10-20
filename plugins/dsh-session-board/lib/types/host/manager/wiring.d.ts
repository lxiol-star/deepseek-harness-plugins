/**
 * Manager wiring: opens the manager domain, subscribes the event sources the
 * mux folds, installs the routes, and attaches manager tools to the resident
 * Agent on creation AND cold resume.
 *
 * This module is registered through a nested `ctx.inject([...])` in the plugin
 * entry, so a profile without the session/workspace/agent services simply
 * never runs it — the board half keeps working.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { BoardFetchRoute } from '../routes.ts';
import type { DomainSpec, DomainTableSpec } from '../domain.ts';
import type { ManagerTable } from './service.ts';
/** Table value type recovered from a domain spec declaration. */
type TableValueOf<S, N extends keyof S & string> = S[N] extends DomainTableSpec<infer V> ? V : never;
/** Structural slice of the host `storageDomain` service. */
export interface ManagerStorageDomain {
    open<S extends DomainSpec>(spec: S): Promise<{
        table<N extends keyof S['tables'] & string>(name: N): ManagerTable<TableValueOf<S['tables'], N>>;
        close(): Promise<void>;
    }>;
}
/** Structural slice of the host `connection` service. */
export interface ManagerConnection {
    readonly fetch: {
        register(route: BoardFetchRoute): () => Promise<void> | void;
    };
}
/** Options for {@link startManager}. */
export interface ManagerWiringOptions {
    /** Nested context that already carries the host services in `inject`. */
    readonly ctx: Context;
    readonly storageDomain: ManagerStorageDomain;
    readonly connection: ManagerConnection;
    readonly warn: (message: string) => void;
    /** Test seam: override the manager workspace directory. */
    readonly managerDir?: string;
}
/**
 * Start the manager subsystem once the host services are present.
 * @param options - nested context plus the two carrier services.
 */
export declare function startManager(options: ManagerWiringOptions): void;
export {};
