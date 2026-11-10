/**
 * Manager drawer copy added by the 0.9.0 layout work.
 *
 * The manager keys that predate the layout rework stay in `../locales.ts`; this
 * module only owns the labels the resizable, collapsible drawer introduces, so
 * the two dictionary edits never collide. Both dictionaries are merged back
 * into the plugin dictionary in `../locales.ts` and therefore go through the
 * same parity, emptiness and placeholder checks.
 */
/** English labels for the manager drawer's layout controls. */
export declare const managerEn: {
    readonly 'manager.chatTitle': "Manager agent";
    readonly 'manager.status.idle': "Idle";
    readonly 'manager.status.running': "Running";
    readonly 'manager.status.waiting': "Needs you";
    readonly 'manager.navCollapse': "Hide navigator";
    readonly 'manager.navExpand': "Show navigator";
    readonly 'manager.maximize': "Maximize panel";
    readonly 'manager.restore': "Restore panel";
    readonly 'manager.focusChat': "Expand chat";
    readonly 'manager.focusChatExit': "Restore view";
    readonly 'manager.resizeHorizontal': "Resize panel width";
    readonly 'manager.resizeNavigator': "Resize navigator width";
    readonly 'manager.resizeTip': "Drag to resize; double-click to reset";
    readonly 'manager.showPaths': "Show project paths";
    readonly 'manager.hidePaths': "Hide project paths";
    readonly 'manager.filterWorkspaces': "Filter workspaces";
    readonly 'manager.filterEmpty': "No workspaces match the filter.";
    readonly 'manager.clearFilter': "Clear";
    readonly 'manager.selectionHintShort': "Queues one message for the manager.";
    readonly 'manager.openSession': "Open session {title}";
};
/** Chinese labels for the manager drawer's layout controls. */
export declare const managerZh: Record<keyof typeof managerEn, string>;
