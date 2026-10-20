/**
 * Authenticated JSON routes for the manager panel.
 *
 * They are registered through `connection.fetch`, so the connection service
 * applies the Host/Origin trust fence and browser authentication exactly like
 * the board's existing routes. Every handler answers `{ ok, ... }`, maps a
 * thrown Error to a contained 4xx/5xx, and never rejects past the boundary.
 */
import type { ManagerSelectionResponse, ManagerStateView, ManagerTaskResponse } from '../../shared/manager.ts';
import type { BoardFetchRoute } from '../routes.ts';
/** Route handlers, implemented by the plugin wiring over the manager service. */
export interface ManagerRouteHandlers {
    /** Provision/read the manager state (may create the manager session on first call). */
    state(): Promise<ManagerStateView>;
    /** Persist the panel selection mirror. */
    selection(body: unknown): Promise<ManagerSelectionResponse>;
    /** Create or update one task. */
    task(body: unknown): Promise<ManagerTaskResponse>;
    /** Contained warning sink. */
    warn(message: string): void;
}
/** Build the three manager routes over the given handlers. */
export declare function createManagerRoutes(handlers: ManagerRouteHandlers): readonly BoardFetchRoute[];
