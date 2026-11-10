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
export const managerEn = {
  'manager.chatTitle': 'Manager agent',
  'manager.status.idle': 'Idle',
  'manager.status.running': 'Running',
  'manager.status.waiting': 'Needs you',
  'manager.navCollapse': 'Hide navigator',
  'manager.navExpand': 'Show navigator',
  'manager.maximize': 'Maximize panel',
  'manager.restore': 'Restore panel',
  'manager.focusChat': 'Expand chat',
  'manager.focusChatExit': 'Restore view',
  'manager.resizeHorizontal': 'Resize panel width',
  'manager.resizeNavigator': 'Resize navigator width',
  'manager.resizeTip': 'Drag to resize; double-click to reset',
  'manager.showPaths': 'Show project paths',
  'manager.hidePaths': 'Hide project paths',
  'manager.filterWorkspaces': 'Filter workspaces',
  'manager.filterEmpty': 'No workspaces match the filter.',
  'manager.clearFilter': 'Clear',
  'manager.selectionHintShort': 'Queues one message for the manager.',
  'manager.openSession': 'Open session {title}',
} as const

/** Chinese labels for the manager drawer's layout controls. */
export const managerZh: Record<keyof typeof managerEn, string> = {
  'manager.chatTitle': '管理 Agent',
  'manager.status.idle': '空闲',
  'manager.status.running': '运行中',
  'manager.status.waiting': '待你处理',
  'manager.navCollapse': '收起导航',
  'manager.navExpand': '展开导航',
  'manager.maximize': '最大化面板',
  'manager.restore': '还原面板',
  'manager.focusChat': '放大对话',
  'manager.focusChatExit': '还原视图',
  'manager.resizeHorizontal': '调整面板宽度',
  'manager.resizeNavigator': '调整导航宽度',
  'manager.resizeTip': '拖动调整宽度，双击恢复默认',
  'manager.showPaths': '显示项目路径',
  'manager.hidePaths': '隐藏项目路径',
  'manager.filterWorkspaces': '筛选工作区',
  'manager.filterEmpty': '没有匹配的工作区。',
  'manager.clearFilter': '清除',
  'manager.selectionHintShort': '会为管理员排队一条消息。',
  'manager.openSession': '打开会话 {title}',
}
