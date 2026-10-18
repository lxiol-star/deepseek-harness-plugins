/**
 * Every user-visible string in this plugin.
 *
 * The panel ships bilingual copy that follows the DSH language setting; no
 * product text is written inline in a component. Placeholders use the
 * `{name}` form the locale runtime interpolates.
 */
/** Dictionary namespace for this plugin. */
export declare const NS = "session-board";
/** English copy. */
export declare const en: {
    readonly 'batch.nativeTitle': "DSH archive results";
    readonly 'batch.native.archived': "Archived in DSH";
    readonly 'batch.native.already-archived': "Already archived in DSH";
    readonly 'batch.native.empty-archived': "Empty session: synthesis skipped, archived in DSH";
    readonly 'batch.native.active': "Still active; kept in workspace";
    readonly 'batch.native.changed': "New content arrived; kept in workspace";
    readonly 'batch.native.unavailable': "Session unavailable; not archived";
    readonly 'batch.native.wiki-failed': "Wiki workflow incomplete; not archived in DSH";
    readonly 'batch.native.failed': "DSH archive rejected; selection kept for retry";
    readonly 'card.clientArchived': "Archived in DSH";
    readonly 'filter.archive': "Archive visibility";
    readonly 'filter.archiveActive': "Hide archived";
    readonly 'filter.archiveOnly': "View archived";
    readonly 'filter.archiveAll': "All sessions";
    readonly 'filter.grouping': "Group sessions";
    readonly 'filter.byStatus': "By status";
    readonly 'filter.byWorkspace': "By workspace";
    readonly 'filter.byTree': "Workspace tree";
    readonly 'card.archived': "Archived to Wiki";
    readonly 'workspace.unassigned': "Unassigned workspace";
    readonly 'batch.scopeMain': "Selected main session";
    readonly 'batch.scopeChild': "Child of {parent} (parentSession)";
    readonly 'batch.snapshot': "In-progress snapshot";
    readonly 'batch.missing': "Child source missing or unconfirmed: {session} (parent {parent})";
    readonly 'batch.synthesis.synthesized': "Knowledge pages generated or already present";
    readonly 'batch.synthesis.skipped': "SKIP / reused conclusion";
    readonly 'batch.synthesis.failed': "Synthesis failed; raw archive retained";
    readonly 'batch.synthesis.sensitive': "Sensitive content detected; not sent";
    readonly 'batch.index.updated': "Index updated";
    readonly 'batch.index.failed': "Index update failed";
    readonly 'batch.index.not-needed': "No index update needed";
    readonly 'batch.error.WORKFLOW_UNAVAILABLE': "Wiki workflow unavailable; check local scripts and SCHEMA.md.";
    readonly 'filter.label': "Filter sessions";
    readonly 'filter.search': "Search titles and previews";
    readonly 'filter.status': "Session status";
    readonly 'filter.all': "All statuses";
    readonly 'filter.blocked': "Waiting for me";
    readonly 'filter.running': "Running";
    readonly 'filter.workspace': "Workspace";
    readonly 'filter.allWorkspaces': "All workspaces";
    readonly 'filter.clear': "Reset";
    readonly 'filter.count': "{shown} of {total} sessions";
    readonly 'empty.noMatches': "No matching sessions. Try another search or reset the filters.";
    readonly 'card.showDetails': "Show details";
    readonly 'card.hideDetails': "Hide details";
    readonly 'panel.title': "Sessions";
    readonly 'panel.count': "{count} total";
    readonly 'group.attention': "Needs you";
    readonly 'group.running': "In progress";
    readonly 'group.done': "Done";
    readonly 'note.blocked': "Waiting for you to continue";
    readonly 'note.error': "The turn ended with an error";
    readonly 'note.unread': "Finished while you were away";
    readonly 'pending.approval': "Waiting for approval";
    readonly 'pending.planReview': "Waiting for plan review";
    readonly 'pending.question': "Waiting for your answer";
    readonly 'pending.unknown': "Waiting for you";
    readonly 'card.current': "Open now";
    readonly 'card.instruction': "Asked";
    readonly 'card.activity': "Produced";
    readonly 'card.noPreview': "No summary available yet";
    readonly 'card.turn': "Turn {n}";
    readonly 'card.step': "Step {m}";
    readonly 'card.turnStep': "Turn {n} · {m} total steps";
    readonly 'card.elapsed': "Running {value}";
    readonly 'card.elapsedTotal': "{value} total";
    readonly 'card.rate': "{value} tok/s";
    readonly 'card.cache': "{value}% cached";
    readonly 'card.tokens': "{output} out / {input} in";
    readonly 'card.jobs': "{count} jobs";
    readonly 'card.background': "Background work";
    readonly 'card.subagents': "{count} subagents";
    readonly 'card.subagentBadge': "Subagent";
    readonly 'card.ack': "Mark read";
    readonly 'card.progressEstimate': "Estimated progress, not a known total";
    readonly 'action.openBoard': "Open board";
    readonly 'action.closeBoard': "Close board";
    readonly 'action.collapse': "Collapse";
    readonly 'action.expand': "Expand";
    readonly 'action.hide': "Hide panel";
    readonly 'action.show': "Show panel";
    readonly 'action.backToTop': "Back to top";
    readonly 'action.densityCompact': "Compact cards";
    readonly 'action.densityFull': "Full cards";
    readonly 'action.resize': "Resize panel";
    readonly 'batch.hiddenSelected': "{count} selected sessions are hidden by filters; preview includes them.";
    readonly 'batch.selected': "{count} selected";
    readonly 'batch.archive': "Archive and synthesize to Wiki";
    readonly 'batch.clear': "Clear selection";
    readonly 'batch.select': "Select session";
    readonly 'batch.deselect': "Deselect session";
    readonly 'batch.label': "Local Wiki archive";
    readonly 'batch.all': "Select visible (up to 50)";
    readonly 'batch.preview': "Preview archive and synthesis";
    readonly 'batch.working': "Working…";
    readonly 'batch.confirmTitle': "Confirm archive and synthesis";
    readonly 'batch.destination': "Archive to ~/wiki/raw/sessions/, then send redacted text to stepx-terra for per-session synthesis and update the index. Successful idle sessions are then archived in DSH without deletion. Empty sessions skip synthesis and are archived in DSH. Active or changed sessions remain in the workspace.";
    readonly 'batch.planCounts': "{count} to copy · {skipped} unchanged";
    readonly 'batch.confirm': "Confirm archive and synthesis";
    readonly 'batch.cancel': "Cancel";
    readonly 'batch.result': "Copied {archived} · unchanged {skipped} · empty {empty} · failed {failed}";
    readonly 'batch.error': "Archive failed. Your selection is kept.";
    readonly 'batch.error.INVALID_SELECTION': "The selection became invalid. Select sessions again and preview before confirming.";
    readonly 'batch.error.HOST_OUTDATED': "This window has newer plugin code than the running Harness host. Quit and reopen Harness completely, then try again.";
    readonly 'batch.error.ARCHIVE_UNAVAILABLE': "Wiki archiver unavailable or timed out. Some pages may already exist; preview again before retrying.";
    readonly 'batch.error.INVALID_RESULT': "The archiver returned an invalid result.";
    readonly 'batch.error.SELECTION_MISMATCH': "A session source changed or is ambiguous. Preview again.";
    readonly 'batch.error.PREVIEW_EXPIRED': "The preview expired. Preview again.";
    readonly 'batch.error.BUSY': "Another archive is running. Try again shortly.";
    readonly 'batch.error.CANCELLED': "The archive was cancelled.";
    readonly 'batch.error.REQUEST_FAILED': "Could not reach the host.";
    readonly 'batch.error.STATE_UNAVAILABLE': "Wiki state could not be updated. Some pages may already exist; preview again before retrying.";
    readonly 'batch.error.UNKNOWN': "Unexpected error. Check Dev host logs.";
    readonly 'a11y.cardContent': "Session preview";
    readonly 'card.waiting': "Awaiting human action";
    readonly 'empty.noSessions': "No sessions yet";
    readonly 'empty.group': "Nothing here";
    readonly 'empty.loading': "Loading sessions";
    readonly 'status.hostOffline': "Live sync unavailable — showing local state";
    readonly 'a11y.board': "Session board";
    readonly 'a11y.dock': "Session panel";
    readonly 'a11y.list': "Session list";
    readonly 'a11y.card': "Open session {title}";
    readonly 'a11y.groupCount': "{group}, {count} sessions";
};
/** Chinese copy. */
export declare const zh: Record<keyof typeof en, string>;
/** Every dictionary key. */
export type SessionBoardKey = keyof typeof en;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'session-board': SessionBoardKey;
    }
}
