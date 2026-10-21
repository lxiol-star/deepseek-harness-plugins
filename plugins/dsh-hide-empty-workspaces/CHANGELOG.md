# Changelog

## 0.3.0

- Add a segmented sidebar view switch above the native Workspace browser: `进行中` (running Sessions), `已完成` (finished Sessions) and `工作空间` (every Workspace, including those with no visible Sessions).
- The `工作空间` view keeps Workspace rows and hides Session rows, so a historical Workspace's native hover actions (New Session / menu) start a new Session there without hunting through the tree.
- `进行中` / `已完成` filter Session rows and hide Workspaces left without a matching row; the list area shows a view-specific empty hint instead of a blank column.
- The view choice is persisted (`dsh.hideEmptyWorkspaces.mode`) and exposed in the Settings tab, which also gains a Default view selector.
- Empty Workspaces stay hidden in the two session views; the `工作空间` view is the way to reach them again. Version 0.2.2's visibility rule (archived unless opted in, blank unless opted in, never subagent) is unchanged.

## 0.2.2

- A Workspace whose only remaining Sessions are subagent children now counts as empty and is hidden. Subagent Sessions never render as Workspace rows (their rows live in the parent header's catalog), but they were counted as visible, so a Workspace left with only teammate/child Sessions kept showing with zero rows.
- The visible-Session rule now mirrors the native Workspace browser: archived (unless opted in), blank (unless opted in), and subagent Sessions do not count.

## 0.2.1

- A Workspace whose only Sessions are blank (created and never used) now counts as empty and is hidden.
- Add the `dsh.hideEmptyWorkspaces.includeBlank=1` opt-out and a matching Settings tab toggle.
- Unknown Session summaries stay visible, so a loading Session list never hides working Workspaces.

## 0.2.0

- Add a Settings -> Plugins tab: status, hidden count, both toggles, re-apply, reload page, diagnostics.
- Compare three versions: loaded client bundle, loaded host code, and the manifest on disk; warn which restart level is needed.
- Add a read-only host route `/hide-empty-workspaces/status` for the version comparison.

## 0.1.1

- Hide Workspaces whose sessions are all archived, not only Workspaces with zero sessions.
- Publish diagnostics at `window.__dshHideEmptyWorkspaces` (version, state, hidden ids, error).
- Add `dsh.hideEmptyWorkspaces.includeArchived=1` to count archived sessions as visible.

## 0.1.0

- Hide Workspaces with no sessions from the native sidebar.
- Emptiness comes from the Workspace Controller snapshot (`sessionIds`), not rendered rows.
- Re-applies after React re-renders; removes marks and the injected stylesheet on dispose.
- `localStorage['dsh.hideEmptyWorkspaces'] = '0'` opts out without uninstalling.
