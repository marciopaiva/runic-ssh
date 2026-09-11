# ADR-0064: Keep the map in its own file beside the host book

* **Status**: Accepted
* **Date**: 2026-09-10

## Context

`docs/plans/map.md` commits the releases from v0.6.0 to v0.9.0 to a spatial
interface: a **component** is one kind of surface (SSH, SFTP, Monitor) on one
saved host, and its icon expands in place into a window; later releases add
lines between components, visions that group them, and layers that nest maps.
The maintainer closed the model in an interactive prototype
(`runic-proposta-modelo.html`) before any code, and the measurement in
`docs/measurements/terminal-under-zoom.md` established that xterm paints
correctly under a zoomed CSS transform.

Three things are already true in the codebase and constrain where the map's
own state can live:

* `sessions.json` is the host book (ADR-0004, ADR-0034, ADR-0057). It holds
  the opaque credential reference for every host, and CLAUDE.md §5 requires
  a migration for any change to its on-disk format. It is read and written
  by `SessionStore`, and edited by one form, the Home wizard.
* One connection per host, one shell per connection. `open_terminal` refuses
  a second shell on a handle (ADR-0014, `commands/terminal.rs`), and
  ADR-0053's `terminalWanted` exists so that opening a host in SFTP does not
  start a shell nobody asked for. SFTP and Monitor use the same handle
  without one.
* The interface is four rail workspaces (`'home' | 'sessions' | 'sftp' |
  'monitor'`, `ActivityRail.tsx`). Sessions renders a session's surface flat
  inside its group (ADR-0015, ADR-0020); SFTP and Monitor left that model
  for their own workspaces (ADR-0029, ADR-0044). A map where every surface
  is a window on a zoomable canvas contradicts ADR-0015 and ADR-0020, and
  the plan defers superseding them to v0.9.0, once the map has parity.

The first release has to put components somewhere that the three later
releases can add to without migrating, and it has to do so without touching
the file that holds credential references or the code paths that keep one
shell per host.

## Options considered

### Option A: a second file, a store shaped like the settings store, a fifth workspace

`workspace.json` beside `sessions.json`, holding `components` (id, kind,
host id, optional layer, position, size) and, from the first version,
`links`, `visions` and `layers` as empty arrays under `#[serde(default)]`,
so v0.7.0 to v0.9.0 add data and never migrate. `WorkspaceStore` copies
`SettingsStore`: a missing file is a first launch, a malformed one is an
error, saves go through a temporary file and a rename. Two thin commands,
`load_workspace` and `save_workspace`, one typed wrapper, one contract test.
The map is a fifth rail entry, `'map'`, that reuses `TerminalView`,
`SftpPane` and the Monitor surfaces as they are and lives beside the three
old workspaces until v0.9.0 removes them.

Costs: a temporary fifth rail entry for three releases; the map and Sessions
both mount terminals for a while, so `mountedTerminals` has to count
components as well as tabs. Forecloses nothing: the cut in v0.9.0 deletes
the old workspaces and leaves this.

### Option B: the map as a mode inside Sessions

A toggle inside Sessions between "groups" and "map", reusing `tabs`,
`groups` and `HeldGroup`, with a component being a tab drawn as a node.
Less new code, because the session state already exists there.

Costs: the group model was built for fixed rectangles (ADR-0019, ADR-0020,
ADR-0022) and every map gesture becomes an exception inside it; SFTP and
Monitor have not been in Sessions since ADR-0029 and ADR-0044, so the map
would be born with SSH only. Forecloses the cut: v0.9.0 would have to undo
the mode before it could remove the model, paying the cost twice.

### Option C: fields on `Session`

`Session` gains `mapPosition`, `mapKinds` and their like, and the map is a
projection of `sessions.json`. No new store, no new commands.

Costs: a host with two components of different kinds becomes two sets of
fields on one record, a vision has nowhere to live, and every drag of a
window rewrites the file that holds credential references, which is the
format change §5 forbids without a migration. Forecloses the later releases:
lines, visions and layers need the second file anyway.

## Decision

Option A.

The reason it beats the others is that every later release only adds to what
it creates, and the cut in v0.9.0 is a deletion, not a rewrite. Option B
saves code now and spends it twice later; Option C saves a file and puts the
map's churn on the one file the project treats as load-bearing.

The tradeoff accepted: for three releases the rail has five entries, and the
interface has two ways to show a terminal. That is the price of a shippable
intermediate at every step, and `docs/plans/map.md` says why a big-bang
rewrite was rejected. A second tradeoff, smaller: the map references hosts by
id, so a host deleted from the book leaves components pointing at nothing;
the store drops them on load and the host popup warns before the deletion,
which is enough while the only editor is that popup.

Two rules from earlier decisions are restated here so the map cannot loosen
them by accident:

* A component is one kind on one host, and only an SSH component asks for a
  shell. Two SSH components on one host are #120 and wait for v1.0.0; until
  then the picker refuses the duplicate with a reason.
* A component with a live session keeps its terminal mounted under ADR-0014's
  rules, hidden with `visibility: hidden` when collapsed to its icon, never
  unmounted while the session lives.

## Consequences

**Good**: `sessions.json` does not change; nothing in `ssh/`, `sftp/` or the
registry knows the map exists; the credential model, the host key flow and
the vault are untouched. The map's persisted model is small enough to read
in one screen, and v0.7.0 to v0.9.0 each add one array to it. The old
workspaces keep working until the day they are deleted.

**Bad**: two ways to show a terminal, for three releases, and a
`mountedTerminals` that has to reconcile tabs and components without ever
mounting a session twice, which is exactly the class of bug ADR-0014
exists for. A fifth rail entry that the canvas has to draw and the catalogs
have to name, all of it thrown away in v0.9.0. Positions and sizes are
stored in map pixels, so a workspace file carried to a screen of a different
size arrives with its windows where they were, not where they fit.

**Follow-up**: v0.6.0 carries the input measurement the spike could not make,
typing into a real terminal under zoom on WebKitGTK and WebView2, and writes
it into `docs/measurements/`. v0.9.0 writes the ADR that supersedes ADR-0015,
0019, 0020, 0029 and 0044 and deletes the old workspaces. Revisit this
decision if the map does not reach parity by v0.9.0: the fifth rail entry
was accepted as temporary, and a permanent one is a different decision.

**Follow-up, 2026-09-10 (ADR-0066).** The rollout above is amended. The map
is not the temporary entry beside the finished workspaces; it is the opt-in
one, behind a preview setting, with classic navigation the default a fresh
install lands on. The v0.9.0 cut is deferred, and its direction, whether to
remove classic, keep both, or cut the map, is left open to be decided on the
signal the preview gathers. This file-layout decision, the map in its own
`workspace.json` beside the host book, stands unchanged; only the rail's
default and the timing of the cut move.
