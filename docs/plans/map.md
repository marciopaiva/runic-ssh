# Plan: the map, from v0.6.0 to v1.0.0

Written on 2026-09-10. The maintainer's spatial interface, iterated in
`runic-proposta-modelo.html` and recorded in the session memory, becomes the
line to 1.0. The `v0.6.0` Import milestone loses its only issue (#128) to a
later date the maintainer no longer cares to fix.

This is a plan, not a decision record. Each release below gets its own ADR
before code, its own artboards before code, and its own `/feature` pass. What
this document fixes is the order and the cut lines, so that four releases add
up to one interface instead of four half-interfaces.

## What the map is, in one paragraph

Four objects, every one a reference into the host book: a **component** is
one kind (SSH, SFTP, Monitor) and one host, and its icon expands in place into
its window; a **line** joins two components of the same kind and carries
broadcast (SSH) or transfer (SFTP); a **vision** is a named set of components
that lays itself out and can fill the screen; a **layer** is a map inside the
map. `sessions.json` does not change; a new `workspace.json` beside it holds
the map. The measurement in `docs/measurements/terminal-under-zoom.md`
established that xterm under a zoomed transform paints fine, and that refit
1:1 is the default between 75% and 125%.

## The principle: coexist, then cut

The map is built as a **fourth rail workspace, "Map", beside Sessions, SFTP
and Monitor**, reusing `TerminalView`, `SftpPane` and the Monitor surfaces as
they are. Nothing in `ssh/`, `sftp/` or the registry changes for the map; the
core does not know it exists. Only when the map reaches parity, in v0.9.0,
are the three old workspaces removed and the rail becomes Home and Map.

The alternative, rewriting `App.tsx` around the map in one go, was rejected:
it has no shippable intermediate, it rewrites every layout test at once, and
it leaves the maintainer without a working client for the whole of it. The
cost of coexistence is one temporary rail entry and a few hundred lines that
die in v0.9.0. That is cheap.

## What does not change, at any point

* `sessions.json`, the credential model (ADR-0004, 0034, 0057), the host key
  flow (rule 3), the internal vault (ADR-0035).
* The credential prompt stays its own window (ADR-0008). A host key prompt
  renders inside the component's window, which is what ADR-0015 meant by
  "the session's surface" once a window is one.
* The IPC surface for terminal, SFTP and Monitor. The map adds commands; it
  does not alter these.
* The security rules in CLAUDE.md §7. The map moves nothing secret anywhere.

## Releases

### v0.6.0 Components

Shipped on 2026-09-10 (PR #359), tagged `v0.6.0`.

**Ships:** the Map workspace with components. Hold the rune to create an SSH
terminal, an SFTP browser or a monitor for a saved host; click expands the
icon into its window in place; the window behaves like a Windows window
(minimize to icon with the session alive, maximize and restore, double-click
title, snap to edges, resize any edge); right-click and hold give the same
actions; the host popup creates and edits a host from the map (the wizard's
fields, credential collected before save); search filters and jumps.

**Backend:** `src-tauri/src/config/workspace.rs` with a `WorkspaceStore`
shaped like `SessionStore`: components (kind, host id, layer, position,
size), and room for lines, visions and layers. Two thin commands,
`load_workspace` and `save_workspace`, in `commands/workspace.rs`; typed
wrapper `src/ipc/workspace.ts`; one error-path test per command.

**Frontend:** `src/features/map/` holds the model, the layout maths, pan and
zoom, pointer gestures (hold, drag, radial) and the refit rule; nothing there
imports React. `src/components/map/` holds `MapStage`, `ComponentNode`,
`ComponentWindow`, `Radial`, `HostPicker`. A component with a live session
mounts its terminal under ADR-0014's rules: one terminal per session, hidden
with `visibility: hidden` when collapsed, never unmounted while the session
lives.

**Constraint carried:** one component per host and kind. A second shell on a
host is #120 and waits for v1.0.0; until then the picker refuses the
duplicate with a reason.

**ADR:** the persisted model beside the host book, referencing by id; why a
second file and not fields on `Session`.

**Canvas:** `Map.dc.html` (the workspace, three components, one open),
`MapComponent.dc.html` (icon, window, minimized, maximized, host key prompt
inside, failure inside), `MapHostPopup.dc.html`.

**Tests:** store round-trip; layout functions; a teardown test per window
(observers, listeners, the terminal mount); IPC error paths; `no-terminal-in-home`
still holds.

**Risk:** input inside a transformed container. The spike measured painting,
not keys and focus; the first thing v0.6.0 does is type into a real terminal
under zoom on WebKitGTK and WebView2 and write down what happened.

**Size:** large. Most of the new code in the whole plan lands here.

### v0.7.0 Lines

**Ships:** hold a terminal, choose Broadcast, click another: a line. The
switch on the line arms typing into all of them, off by default, disarmed
when the set changes, each window able to mute itself (ADR-0019, unchanged
rules, new gesture). Hold an SFTP, pull a line to another: a directed line;
select files on the origin and click the arrow to send to every destination,
asking first when there is more than one (ADR-0045's fan-out, PasteConfirm's
question). The local machine becomes an SFTP component, which is how upload
and download exist once a window is one pane.

**Backend:** none new. Lines persist as `links` in `workspace.json`.
Transfer already reads once and writes N times; sync input already exists in
`features/terminal`.

**Frontend:** `features/map/lines.ts` (groups from links, arm keys, direction
for SFTP), `LineHandle`, the link mode in `MapStage`; sync input keyed by
line group instead of pane set.

**ADR:** lines as the visible form of broadcast and fan-out; supersedes the
picker's fixed source. **Canvas:** `MapLines.dc.html`. **Tests:** group
derivation, disarm on change, the confirmation, the flood teardown still
passing.

**Size:** medium.

**Reviewed on 2026-09-10**, after v0.6.0 shipped, before any line code.
What the review found, and where it went:

* `Link` was `{a, b}` with no direction and `validate` did not check the
  kinds at the ends; the map's SFTP window transferred nothing
  (`renderMapSftp` passed `onSend: null`); `Component.host` was a session id,
  so the local machine could not be a component; broadcast was keyed by
  `HeldGroup`, which the map does not have. ADR-0065 answers all four:
  order is direction on a file-browser link, one family per link, `local`
  as a fourth kind with `host` absent, connected sets of terminal links as
  the map's groups with a switch of their own beside Sessions'.
* The maintainer confirmed the local machine as an SFTP component ("Esta
  máquina"); it is the file browser of the machine Runic runs on, not a
  local terminal, which does not exist in Runic.
* Order of work: `fix/map-strip` first (#363 and #364, PR #366, merged
  2026-09-10), since the line handle uses the same capture path; then this
  ADR and `MapLines.dc.html`; then #367 (terminal line), #368 (file-browser
  line and the local machine), #115 scoped to the map window with the
  `execCommand('paste')` measurement first; then the release.
* Still the maintainer's: whether the menu ships without paste if the
  measurement fails, and the triage of the seven unscheduled issues.

### v0.8.0 Visions

**Ships:** a vision groups components and their lines; closed it is an icon
with the count, open it is a region that lays its members out in ADR-0022's
shape for the count and sizes itself to them; a member the user drags stays
where left; double-click fills the screen; a member maximizes inside its
vision like a child window. Enter a vision full screen and you have the
Sessions split of ADR-0020 as a state of the vision.

**Model:** `visions` in `workspace.json`: name, components, open, pins, layer.

**Closes:** #119 (connect a whole group into a split): open a vision.

**ADR:** the vision as the successor of the group. **Canvas:**
`MapVision.dc.html` (closed, open, full screen, child maximized).

**Size:** medium.

### v0.9.0 Layers, and the cut

**Ships:** layers as maps inside the map; then the cut: Sessions, SFTP and
Monitor leave the rail, which becomes Home and Map. Groups, tabs, the strip,
the shape control, the SFTP split control and the sessions sidebar are
deleted with their tests; the palette's session commands point at the map;
Home keeps the host book and settings exactly as ADR-0052 onward built them.

**ADR:** one document superseding ADR-0015, 0019, 0020, 0029, 0044 and the
workspace half of 0046, saying what each decided and what replaces it. The
`group` field on `Session` is retired from the editor and kept in the file as
the Home tag ADR-0060 already reduced it to.

**Canvas:** regenerate every artboard from the new skeleton in `gen.py`
(Map, Home, the variants), which also closes #262.

**Size:** large, mostly deletion. **Risk:** the long tail of flows wired
through `App.tsx`: credential redirect (ADR-0039, 0040), inline host key,
connection failure, the missing-credential banner (#353). Each needs a home
inside the component window before its old home is deleted, and the list is
made in Phase 1 of this release, not discovered in Phase 4.

### v1.0.0

What the README already promises, plus what the map left for last: second
shell as a duplicate component (#120), keyboard navigation of the map (#122),
the context menu (#115) in its final form, concurrent connections (#306),
macOS on real hardware (#132), the named Spanish reviewer (#227), the
WebView2 measurement the spike could not make, signed installers on every
platform, and a `Known limitations` section that says what a map is not.

## What moves where

| Issue | Was | Becomes |
| --- | --- | --- |
| #128 Import | v0.6.0 | no milestone; "later, if asked" |
| #115 Context menu | none | v0.6.0, on the component; v1.0.0, final |
| #119 Group into a split | none | v0.8.0, closed by visions |
| #120 Second shell | none | v1.0.0 |
| #121 Drag the divider | none | closed, won't do: windows resize on any edge |
| #122 Keyboard for panes | none | v1.0.0, as keyboard for the map |
| #262 Canvas drift | none | v0.9.0, regenerate |
| #353 Missing-credential banner | none | v0.9.0, with the long tail |

Milestones to rename or create: `v0.6.0 Components`, `v0.7.0 Lines`,
`v0.8.0 Visions`, `v0.9.0 Layers and the cut`. The README roadmap lists
the same four lines.

## Rules that hold in every release

* ADR and artboards before code, per CLAUDE.md §4; the prototype is where a
  change is tried first, and it is never the source of truth for a string or
  a token.
* Every user-facing string lands in `src/locales/en.json` first, then pt-BR
  and es.
* Every window, observer and interval has a teardown path and a test that
  proves it runs (§6).
* Refit 1:1 between 75% and 125%; a terminal below 75% is a thumbnail.
* `prefers-reduced-motion` turns every motion into a cut.
* The gate and `pnpm prose` run before any report of done.
* `CHANGELOG.md` and its `Known limitations` are written before the tag (§10).
