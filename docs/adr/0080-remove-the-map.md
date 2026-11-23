# ADR-0080: Remove the map

* **Status**: Proposed. When accepted, ADR-0064, 0065, 0066, 0067, 0068, 0073
  and 0075 become `Superseded by ADR-0080` (ADR-0069 was already superseded by
  ADR-0075), and `docs/plans/map.md` is marked as retired.
* **Date**: 2026-11-23

## Context

The map was planned in September 2026 as the line to 1.0: a spatial interface
where a saved host becomes a component, lines carry broadcast and transfer,
visions group components and layers nest them (`docs/plans/map.md`). The plan
was explicit that the three classic workspaces would be removed once the map
reached parity, in v0.9.0. That cut never happened. The map shipped as an
opt-in preview (ADR-0066), then as a fourth workspace beside Home, SSH and
SFTP (ADR-0075), and the classic workspaces stayed.

What is true now, from reading the code and driving the application on
2026-11-23:

* **Size.** About 6,100 lines of interface (`src/components/map`,
  `src/features/map`), 982 lines of Rust for `workspace.json`
  (`config/workspace.rs`) plus 57 for its two commands, 119 catalogue keys
  under `map.*` in each of three locales, and 25 test files.
* **Two worlds.** A terminal opened on the map is not a tab in the SSH
  workspace. With two live terminals on the map, the SSH workspace shows "No
  session open", and the status bar shows "No session" and a stale terminal
  size. The map and the classic workspaces keep their own surfaces for the
  same session.
* **The central gesture fails.** Arming a broadcast line from a terminal's
  menu starts a React render loop (`Maximum update depth exceeded`, about ten
  per second until Escape). Clicking the target does not complete the line,
  and the target's window disappears from the vision. The line is the reason
  the map exists.
* **Density.** Map windows measured 72x15 and 94x20 characters. The classic
  SSH workspace gives a terminal the whole area.
* **Cost of coexistence.** The map reaches into `App.tsx` through four
  effects that lift state up (toolbar content, reach, focused session,
  receiving count), and the shell carries preview-feature state, an opt-in
  prompt and a fourth workspace branch for a feature that is off by default.
* **Little is lost.** The map is off on a fresh install. Two things outside it
  depend on it: the fleet run's "start from a vision" presets (ADR-0078,
  #486 reads visions from `workspace.json`), and the Copy and Paste pane
  menu (#502), which reuses `terminalMenu` and `MapMenu` from the map's
  directories.

CLAUDE.md section 5 puts removing an IPC command and dropping a stored file's
meaning on the stop-and-ask list, which is why this is a decision record and
not a refactor.

## Options considered

### Option A: Remove the map

Delete `src/components/map`, `src/features/map`, the preview-feature opt-in
and its prompt, the map branch of the workspace switch, the `map.*` strings
and the 25 tests. Remove `config/workspace.rs`, `commands/workspace.rs`, the
two commands and `src/ipc/workspace.ts` in a second step. Leave any existing
`workspace.json` on disk, unread.

Cost: the one-to-many "draw a line" metaphor and visions are gone, and the
fleet run needs another starting set. Forecloses: a spatial interface in this
codebase, until someone writes a new one on better footing.

### Option B: Shrink the map to an overview that opens terminals in SSH

Keep the map as a picture of hosts, visions and live state. Opening a
component opens a tab in the SSH workspace, not a window on the map, and
broadcast is configured where it already lives. This removes the duplicated
session surface, the small terminals and the status bar problem together.

Cost: still most of the map's code, the Rust store and the 119 strings, plus
the new bridge to the SSH workspace, for what would be a launcher. The
broadcast line would have to be redrawn on top of the existing broadcast
mechanism, which is real work for a gesture the SSH workspace already covers.
Forecloses little, but keeps the maintenance cost of an interface few use.

### Option C: Keep the map and fix it

Find and fix the render loop, wire the status bar to the map's focused
session, and size windows better. Keep the plan's goal of replacing the
classic workspaces.

Cost: the largest, and the plan's goal conflicts with ADR-0032: nothing may
render remote output while the inline credential field is on screen, so
terminals cannot simply stay mounted under a canvas. The map would have to
earn parity with a workspace whose terminal density it cannot match. Keeps
two ways to show a terminal indefinitely.

## Decision

Option A, on the maintainer's direction. The map is a large interface for a
benefit the classic workspaces already deliver with less surface and more
room for the terminal, and its main gesture is broken. Option B is the
fallback if a launcher over the host book turns out to be missed; it is
cheaper to build later from the host book than to carry now. Option C keeps
the project paying for two interfaces.

How the two outside dependencies are handled:

* **Fleet presets.** A saved host already carries an optional `group`
  (`Session.group`, ADR-0060). The run's "or start from" buttons offer the
  host groups, with the same rule as before: they tick the connected members
  and name the ones left out. No new field and no change to `sessions.json`.
* **Pane menu.** `terminalMenu` and `MapMenu` move out of the map directories
  into shared locations before the map is deleted, and the broadcast and mute
  entries, which only the map used, are dropped with it.

What stays untouched: `sessions.json`, the credential model, host key
verification, `known_hosts`, and the macro store. An existing `workspace.json`
in a user's config directory is not read, not migrated and not deleted. Nothing
in the application changes on a machine that never turned the preview on.

The `previewFeatures` setting stays in the settings file and in the IPC
contract (`tests/ipc-contract.test.ts` pins it) for one release as an inert
field, so a frontend or a settings file from before this change keeps loading.
Removing it, and `set_preview_features`, is a separate step that waits for its
own check.

The tradeoff accepted is that visions go with the map. A person who built them
loses the saved sets and the layout. They can recreate the useful part as host
groups, and the changelog says so.

## Consequences

**Good**: one place to show a terminal; the status bar, the SSH tabs and the
session registry agree again. About 6,100 lines of interface, about 1,040
lines of Rust and about 120 strings per locale less to maintain, test and
translate. `App.tsx` loses a workspace branch, the preview state and four
lifted effects. The render loop disappears with the code that has it. The
navigation review can proceed without a fourth workspace to account for.

**Bad**: the loss of a spatial overview and of one-to-many lines for the few
people who used them. Visions are lost as a named set; host groups are a
weaker equivalent, because a host belongs to at most one group. A leftover
`workspace.json` stays on disk with no meaning. The documentation, the
screenshots in the README and the roadmap line for the map have to be
rewritten, and a published promise ("the map becomes the interface by 1.0")
is withdrawn.

**Follow-up**:

1. PR one: move `terminalMenu` and `MapMenu` out of the map, and make the fleet
   run offer host groups. Behavior unchanged otherwise, tests green.
2. PR two: remove the frontend map, the preview opt-in and prompt, the
   workspace branch and the strings, and rewrite the tests that touched them.
3. PR three: remove `config/workspace.rs`, `commands/workspace.rs`, their two
   commands and `src/ipc/workspace.ts`, and update the IPC contract test.
4. Docs: README (screenshots, the map paragraph, the roadmap), mark
   `docs/plans/map.md` as retired, change the status of the superseded ADRs,
   add a CHANGELOG entry that names visions and `workspace.json`.
5. Later, with its own check: drop the inert `previewFeatures` field.

Revisit if a launcher over the host book is requested, in which case start
from Option B on the host book rather than from the removed code.
