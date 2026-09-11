# ADR-0067: Make the vision the successor of the group

* **Status**: Accepted
* **Date**: 2026-09-11

## Context

`docs/plans/map.md` names v0.8.0 "Visions": the third object of the spatial
interface ADR-0064 opened. v0.6.0 shipped the component, a window on one
saved host in one kind; v0.7.0 shipped the line, broadcast and fan-out drawn
between components (ADR-0065). `workspace.json` already holds a `visions`
array, empty, declared from the first version so this release adds data and
never migrates. `Vision` today is `{ id, name, components, open, layer }`,
and `validate` in `config/workspace.rs` checks the id, the name and that
every member exists. What a vision does on the map, what it stores beyond
that, and how it relates to the group Sessions already has was left to this
document.

On 2026-09-11 the maintainer asked for the whole map model, visions and
layers, to be finished before v0.8.0 opens, so that v0.9.0 holds refinements
only. Layers get their own record (ADR-0068). The cut of the classic
workspaces stays where ADR-0066 left it: deferred, to be decided on the
signal the preview gathers. Nothing here touches Sessions, SFTP or Monitor.

Three earlier decisions constrain what a vision may be:

* **ADR-0019 and ADR-0020, the group.** Sessions puts panes in fixed
  rectangles, a group per rectangle, tabs inside. Broadcast is a switch on
  the group, off by default, disarmed when the set changes (ADR-0019). The
  map has no groups: ADR-0065 derives broadcast from the connected sets of
  terminal links, and a switch on the line. A vision must not become a second
  place the switch lives.
* **ADR-0022, the shapes.** Sessions offers eight grids, `1x1` to `3x3`, and
  the reason for nine is written there. `features/terminal/groups.ts` holds
  them as `GRIDS` and `gridBoxes`, pure and reusable. A vision that lays
  members out in "the shape for the count" is bound to those shapes, not to
  a new set.
* **ADR-0014, one terminal per session.** A terminal is mounted once, kept
  in one stable parent for the life of the session, hidden rather than
  unmounted when its window collapses. The map honours this by computing
  frames and handing them to a stack the shell owns (`MapTerminals`). Any
  vision state that moves windows, the region's reflow or the screen-filling
  mode, may change frames and nothing else.

Issue #119 asks to connect a whole group into a split with one action. The
plan closes it with the vision, and the maintainer settled on 2026-09-11 how:
filling the screen with a vision only expands its members; it does not
connect them. That is ADR-0053's rule at the scale of a set, that nothing
starts a session nobody asked for; connecting every member is its own
explicit action. Two more answers from the same day bind this record: a
component belongs to at most one vision, and the map has one level of layers,
so a vision sits on the outermost map or inside one layer, never deeper.

The maintainer settled the vision's shape in the prototype
(`runic-proposta-modelo.html`) before v0.6.0: closed, an aperture with the
member count and a mark per kind; open, a region that lays its members out
in rows, sizes itself to them and is never resized by hand; a member the user
drags inside the region stays where it was left, the rest keep flowing; the
region's bar drags the whole block; dragging a component into the region or
onto the aperture adds it, dragging it out removes it; double-click fills the
screen with the members in ADR-0022's shape for the count, the map hidden,
`Esc` giving everything back; a member maximizes inside its vision like a
child window; a line from outside to a member of a closed vision ends at the
aperture. The prototype stored `pins` beside `components`.

## Options considered

### Option A: a position on the vision, member positions relative to it, order as layout

`Vision` gains `position: Option<Point>`, where the aperture sits closed and
where the region's top-left anchor sits open, omitted when `None` like a
component's. Nothing else is added: a member's own `Component.position` is
reinterpreted while it belongs to a vision as relative to the region's
anchor, and its presence is the pin. Absent, the member flows in the grid;
present, it stays where it was left; "Back to the grid" is the
`resetPosition` the component menu already has. The `components` array is
ordered, and that order is the grid order, which is what a full screen and a
reflow both read.

The region lays members out from `GRIDS`: the shape for the count is the
first grid that holds it (one to nine); above nine, rows of three. Each cell
is as large as its member (the window's size open, the icon's box closed),
the region is the union of the cells and the pins plus a margin, and every
change to a member resizes the region. Full screen is a state of the stage,
not of the file: every member open, `gridBoxes` of the shape over the whole
stage as frames, the floor hidden, `Esc` restoring what was. A child
maximized inside its region is the same kind of state: one frame the size of
the region, the siblings hidden until restore.

Costs: two meanings for one field, `Component.position`, decided by
membership; moving a component into or out of a vision converts its position
between the two frames of reference, in the model operation, or the window
jumps. A member removed by `prune` leaves no trace, which is right.

### Option B: a `pins` map on the vision, members keep absolute positions

`Vision` gains `position` and `pins: HashMap<String, Point>`, one entry per
pinned member in region coordinates, as the prototype stored it. A member's
`Component.position` stays absolute and is ignored while it is a member.

Costs: a second place a position lives, and two of them per pinned member,
one stale. A member taken out of its vision returns to a position that may
be years old, or none. `validate` grows a rule that every pin names a member.
It matches the prototype's JSON, which is the reason someone would pick it,
and the prototype was never the source of truth for the format (plan, rules).

### Option C: the vision is a group

Reuse `HeldGroup` and the Sessions grid: a vision is a group whose entries
are components, drawn as one rectangle with tabs, and full screen is
`SplitLayout` with the map's terminals moved into it.

Costs: the map's windows stop being the node; a member has no position, no
size and no icon of its own inside the group; SFTP and Monitor have not been
in a group since ADR-0029 and ADR-0044, so the vision would be born with
terminals only; and moving terminals between the map's stack and the
Sessions layout is precisely the double mount ADR-0014 exists to prevent.
Least new code, and the shape v0.9.0's cut would have to undo first.

## Decision

Option A.

It beats Option B because a position should live in one place, and the
component already has one; the pin is a fact about where a member is, not a
second copy of it. It beats Option C because the vision is meant to succeed
the group, not to be one: the group was built for fixed rectangles and the
window is the map's unit.

The tradeoff accepted is the double meaning of `Component.position`. The
model operations that add a member, remove one, or delete a vision are the
only places that convert between frames, and each has a test that a member
does not jump. A reader of `workspace.json` has to know that a member's
position is relative; the field's doc comment says so.

Rules restated so the vision cannot loosen them:

* A component belongs to at most one vision, and a vision and its members sit
  on the same level of the map (`validate` refuses both). Lines stay on
  components; a vision has none, and the region is not a broadcast set.
  Broadcast is the line's switch (ADR-0065), and only that.
* Full screen expands, it does not connect. "Connect all" on the vision's
  menu connects every member without a session, one `connect` each, and is
  what closes #119. A member without a session shows its saved state inside
  its cell, the way its window does on the map.
* Full screen and a maximized child persist nothing; `open`, `position`,
  `components` and the members' pins are the whole of what the file keeps.
* A terminal is never remounted by any vision state (ADR-0014): full screen
  and child maximize change frames only.
* The region is never resized by hand. Its size follows its members.

## Consequences

**Good**: `workspace.json` grows one optional field and no migration; a file
written by v0.8.0 is read by v0.7.0, which ignores what it does not know. The
group's one real feature the map lacked, several hosts filling the screen in
one shape, arrives as a state of an object the map already had room for. #119
closes with an action whose meaning is explicit. The layout is ADR-0022's, so
the maintainer's nine-rectangle reasoning holds here without being restated.

**Bad**: one field with two frames of reference, guarded by tests rather than
by the type. A region that sizes itself to its members can grow past the
stage, and the answer is zoom, not a scrollbar. A vision with many members
past nine lays out in rows of three, which nobody has measured; ADR-0022's
reasoning stops at nine and this record does not extend it. Full screen
hides the floor, so a line's switch is unreachable there; a set armed before
entering stays armed, which is what the prototype showed and what ADR-0019's
disarm rule allows, since the set did not change.

**Follow-up**: ADR-0068 gives the vision a `layer` to sit in and the rule
that it never spans two. The cut, if ADR-0066's signal ever asks for it,
supersedes ADR-0019 and ADR-0020 with the vision as the group's successor;
this record does not. Revisit the rows-of-three rule when someone puts more
than nine hosts in one vision and says what it was for.
