# ADR-0082: Give the Stage a host's facets side by side, on the existing group engine

* **Status**: Proposed on 2026-11-23. Written for the maintainer to decide, and
  not to be started before the maintainer says go, which ADR-0081 ties to a
  week of using slices 1, 2 and 4. If accepted it supersedes parts of ADR-0020
  and ADR-0029 and leaves ADR-0044 and ADR-0045 standing
* **Date**: 2026-11-23

## Context

ADR-0081 chose Spaces, a Stage and a Bar. The Bar, the Spaces with their Hall
and guard, and the Logbook are built. The Stage is the part that changes the
centre of the application, and ADR-0081 said it gets its own decision before
any code, naming what it replaces. This is that decision, written after reading
what is there.

What exists, from the code on 2026-11-23:

* **A group engine that already tiles.** `features/terminal/groups.ts` divides
  the Sessions workspace into up to nine equal rectangles (`GRIDS`, `1x1` to
  `3x3`). A rectangle is a `HeldGroup`: an ordered list of entries and the one
  that is active. Entries move between rectangles (`moveEntry`, `placeEntry`),
  and the sync switch (`receivingSessions`, `inputTargets`) already fans typed
  input out to the active entry of each rectangle. This is the Stage's tiling
  and casting, built and tested, under the name "groups" (ADR-0019, 0020, 0029).
* **A host's surfaces are not side by side.** One host has a terminal and, inside
  it, a facet bar that switches to Monitor or Forwards (`SessionFacets`,
  `SessionBody`). Its files are in a different workspace (ADR-0044) with its own
  grid of endpoints (ADR-0045). Seeing a terminal and its files at once means
  two workspaces and a switch between them. This is the first of the problems
  ADR-0081 named.
* **A tab strip is the only way to hold a session you are not looking at.**
  `GroupStrip` lists the entries of a rectangle. A session alive and not in
  front is a tab behind another tab. There is no shelf.
* **Terminals unmount on a workspace switch, on purpose.** Every terminal is
  mounted inside the Sessions branch of `App.tsx`, so leaving it unmounts them
  all (ADR-0014, ADR-0032, #492), and `tests/no-terminal-in-home.test.ts` guards
  it. The inline credential field is safe because nothing renders a host's
  output while it is on screen.
* **Tiles that move must not remount a terminal.** An xterm that is torn down
  and rebuilt loses its scrollback and its alternate screen, and a resize
  refits it and resizes the remote pty. This constraint decides most of what
  follows.

## Options considered

### Option A: No Stage. Stop at slices 1, 2 and 4

Keep groups, tabs and the SSH and SFTP split. The Bar reaches everything, Spaces
tell environments apart, the Logbook remembers. This is the fallback ADR-0081
already named. It costs nothing more, and it leaves the first problem in place:
a terminal and its files are two workspaces. It forecloses nothing, and the
Stage can still be decided later with more use behind it.

### Option B: Facets side by side, a shelf, on the existing group engine

Keep the grid, the groups and the sync switch. Change what a rectangle can hold
and how a parked session is shown.

* **A host's rectangle can show its facets together.** Terminal stays the main
  tile. A host's Files and Monitor become tiles of that host that sit beside the
  terminal, inside the same rectangle, split by a draggable divider instead of
  a tab. Files reuses the SFTP pane component (`SftpPane`) with the host as its
  endpoint, so it is not a second implementation of listing and transfer.
* **A shelf replaces the tab strip as the way to park a session.** A session that
  is alive and not in a rectangle rests on a strip at the bottom as its sigil
  with a state glyph. A click puts it back into the rectangle that asked, without
  reconnecting. Internally a parked session is the entries of a group that is not
  showing, which `HeldGroup` already is, so this is a view over existing state.
* **Casting is the sync switch, shown as chips.** The armed set appears in the
  Bar's scope and as a mark on each rectangle. The production guard from slice 2
  is already in front of arming it.
* **The SFTP workspace stays.** Moving files between two hosts, and fanning one
  file out to several, is ADR-0045's job and needs two panes on two endpoints.
  The Files tile answers "the files of this host next to its terminal" and does
  not try to be the transfer view. This answers open question 6 of
  `docs/plans/spaces.md` as "both".
* **Credentials.** A credential prompt takes the whole Stage: while the inline
  field is on screen no rectangle renders a terminal. This is stronger than
  today, where other rectangles' terminals stay mounted beside an editor tab, and
  it is what ADR-0032's premise needs. It costs a visible interruption of every
  other rectangle while a password is typed, which is the honest price.

Cost: moderate. New components for the divider and the shelf, the Files tile
wired to an endpoint, a change to what `GroupStrip` draws, and a test that every
move keeps a terminal mounted exactly once. No tiling engine, no new dependency,
no IPC change, no change to `sessions.json`. Forecloses free-form tiling:
rectangles stay a grid of equal cells, and a facet split inside a rectangle is
one divider, not a tree.

### Option C: A free-form tiling engine

Arbitrary splits in a tree, resizable borders, drag a tile anywhere, drag a file
from one tile to another as a transfer. The highest ceiling and what ADR-0081's
illustration drew. It needs a layout tree, persistence of it, hit testing for
drops, keyboard focus movement between tiles with a focus ring that does not
glide, and a guarantee that a move never remounts a terminal, which a tree makes
harder than a grid does because a node that changes parent is a remount in React
unless it is built around portals. It also replaces the sync model, since
"armed" would have to be a property of an arbitrary tile and not of the active
entry of a rectangle. Cost is the largest of the three, with a risk to the one
thing the application is for, a terminal that does not lose its state.
Forecloses nothing, and is the option most likely to be started and not finished.

## Decision

Proposed: **Option B**, after the maintainer has used slices 1, 2 and 4. If the
week of use shows that the tab strip is not what gets in the way, Option A is the
right answer and this ADR is set aside as Rejected with its reasoning kept.

B beats C because the grid already gives tiling, casting and a safe mounting
model, and the two things ADR-0081 found missing, a terminal beside its files and
a way to rest a session, do not need a tree. It beats A only if the maintainer
finds the two-workspace split costly in use, which is a thing to decide with the
application in hand and not on a drawing.

Rules that would hold, carried from ADR-0081 and the code:

* **Never remount a terminal to move it.** A test mounts N rectangles, moves
  entries between them, parks and restores, and asserts each `TerminalView` was
  constructed once. This test is written before the shelf, not after.
* **A resize refits once.** Dragging a divider updates geometry with pointer
  capture and refits the terminal once per animation frame. No animation of
  width or height: that would resize the remote pty on every frame.
* **Keyboard first.** Moving focus between tiles, parking and restoring are keys,
  and none of them animates.
* **The credential step takes the whole Stage**, with the guard test kept.
* **Nothing is persisted that was not before.** The layout stays in memory, as it
  is today. Persisting it is a separate decision.

## Consequences

**Good**: a terminal and the files of the same host in one view, without leaving
the workspace. A shelf that says what is alive and not in front. No new
dependency, no change on disk or in the IPC. Sync, split shapes and the existing
group tests keep working because the engine is the same.

**Bad**: the grid stays a grid, so the layout the illustration drew is not
reachable. The Files tile and the SFTP workspace are two ways to see files, which
is a thing to explain. Taking the whole Stage for a credential prompt hides
other terminals for the length of a password, which will be noticed. The tab
strip, the thing people know, is partly replaced by the shelf and has to be
learned again.

**Follow-up**:

1. The maintainer's go, after a week with slices 1, 2 and 4, and answers to the
   questions below.
2. If accepted, set ADR-0020's tab strip and ADR-0029's group scoping to
   "partly superseded by ADR-0082", keeping ADR-0044 and ADR-0045 as they are.
3. A first slice that carries no risk to terminals: the Files tile for a host,
   with the mounting test, before the shelf.
4. Revisit C only if B's single divider is found too small for real use.

## Open questions

1. Is a terminal beside its files worth the change, or is the SSH and SFTP
   switch fine now that the Bar can open a host's files in one keystroke?
2. Should a facet split be remembered per host, or start the same every time?
3. When a credential prompt takes the whole Stage, should the other rectangles go
   blank, or show a covered placeholder with the sigil and state?
