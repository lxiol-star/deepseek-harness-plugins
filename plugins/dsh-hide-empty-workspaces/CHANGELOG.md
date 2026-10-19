# Changelog

## 0.1.1

- Hide Workspaces whose sessions are all archived, not only Workspaces with zero sessions.
- Publish diagnostics at `window.__dshHideEmptyWorkspaces` (version, state, hidden ids, error).
- Add `dsh.hideEmptyWorkspaces.includeArchived=1` to count archived sessions as visible.

## 0.1.0

- Hide Workspaces with no sessions from the native sidebar.
- Emptiness comes from the Workspace Controller snapshot (`sessionIds`), not rendered rows.
- Re-applies after React re-renders; removes marks and the injected stylesheet on dispose.
- `localStorage['dsh.hideEmptyWorkspaces'] = '0'` opts out without uninstalling.
