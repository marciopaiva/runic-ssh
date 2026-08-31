# ADR-0029: Scope groups, splitting and sync to sessions

* **Status**: Accepted
* **Date**: 2026-08-29

## Context

ADR-0020 put every open thing through one model: a `Focus` union of `session`,
`editor` and `settings`, held in `HeldGroup`s that can be split (ADR-0019) and
carry a sync switch at the trailing edge of their strip (ADR-0021, which also
put a shape control in the top strip for dividing the whole main area). The
model was reasoned about and built for one case: a pool of hosts, split into
rectangles, typed into together. The editor and settings rode along inside it
because there were only three kinds of thing that could be open, and running a
third kind through the ring `focus.ts` already had was cheaper than a second
ring (ADR-0017).

Two leaks have shown up since, both the same shape: the group model exposes an
affordance that only means something for a terminal, and both stayed reachable
from a group whose active tab was settings, which has no terminal behind it.

* The sync switch (`GroupStrip.tsx`) stayed visible and clickable on a group
  showing settings. Pressing it there armed a broadcast that reached sessions
  in *other* groups entirely, from a tab with no session behind it deciding
  where a keystroke typed somewhere else goes. Fixed 2026-08-29:
  `groupSyncState` now returns `null` for a group not showing a session, and
  the strip draws no switch at all rather than a disabled one.
* The shape control (`ShapeControl.tsx`) had no such guard at all. A window
  holding only settings could be divided into two rectangles, one of them
  permanently captioned "no session in this group, drag a host here": chrome
  describing something that was never going to happen, which is exactly what
  ADR-0020 rule 6 refuses. Fixed the same day with a `canSplit` prop, gated the
  same way the command palette already gates its own split commands
  (`sources.ts`), which the shape control's own module comment claimed parity
  with and had never actually kept.

Both fixes are per-affordance guards, and the model has more affordances than
two: `receivingSessions`, the drag-and-drop target a rectangle accepts,
`GroupMenu`'s "closing this drops N connections" wording, whatever a future
affordance turns out to need on the strip. Each is either already checking "is
this really a session" or is a latent instance of the same bug, waiting to be
found the way the other two were.

SFTP (#127, v0.2.0 milestone) is not a guard away from fitting the model at
all. Its first cut is a directory listing, upload and download with progress,
and cancelling a transfer in flight: controls a terminal's group strip has no
room for and a shape control has no business offering to split, since there is
no reason a file browser should ever be one of four rectangles. #127 already
calls itself architectural and asks for its own ADR before code; this document
is the anatomy that ADR will build inside, decided now rather than alongside
SFTP itself. Note for whoever writes it: #127 also records that a transfer
opens a channel beside a shell that is already running, on the connection that
already exists, rather than a second connection. That constrains how an SFTP
workspace picks a host, but not whether it needs one. That choice belongs to
SFTP's own ADR.

A fourth thing is wanted open at once, alongside the three above: a Home
screen carrying counts (hosts, groups) and doubling as where a host, a group
or an application setting is created or changed, "cadastros" in the shape it
was proposed. That is the editor's and settings' actual home. Running them
through the terminal's group model was never load-bearing; it was the only
ring that existed at the time.

Three different kinds of main area are in view now, not one:

* **Sessions**: a pool of hosts, split into rectangles and typed into
  together. Exactly ADR-0019's case, unchanged.
* **Home**: one screen. A dashboard, plus a tab per host, group or setting
  being edited, in a flat strip with no splitting. A form has never wanted to
  sit beside another form in a divided rectangle.
* **SFTP**: a file browser per connection, with a transfer queue and progress
  chrome, and no reason to ever be a rectangle among rectangles.

Folding every one of them through the group model started as economy: one
ring, one strip, one set of tests. It has become the opposite. Two guards were
already written to keep it from lying about what it offers, and the third,
more expensive shape, SFTP, cannot be fixed by a guard at all, because there is
no terminal-shaped rectangle to disable. There is only chrome that was never
terminal-shaped to begin with.

## Options considered

### Option A: keep patching the shared model

Every affordance the group model has gets a guard for "does the active tab of
this group hold a session," the way the sync switch and the shape control just
did. SFTP arrives as a fourth `Focus` kind, with no split and no sync, and
whatever controls it needs get squeezed onto a `GroupStrip` built to be a
28px terminal tab bar with a name and a close button.

Cheapest per patch: it needs no new abstraction today, and it is the path the
last two fixes already took. It does not end. Every terminal-only fact the
group model carries is a candidate for the same class of bug, found one at a
time, each after it has already shipped. And SFTP's own chrome (a progress
bar, a cancel button, a directory breadcrumb) has nowhere honest to live once
it gets there; `GroupStrip` was never built to hold it.

### Option B: give sessions, home and SFTP their own workspace, each with only the chrome it needs

The rail becomes a real switcher between workspaces, the way ADR-0020 always
left room for once a second view existed: *"There is one view here and not
three."* Only the Sessions workspace keeps groups, splitting and the sync
switch; `HeldGroup` and `Focus` narrow back to holding a session and nothing
else. Home carries the dashboard and every host, group and settings form as
its own tab in a flat strip with no splitting. SFTP gets its own workspace when
#127 designs it, with whatever chrome a transfer needs and no shape control
asking it a question it has no rectangles to answer.

Costs more up front. `App.tsx` currently draws sessions, editors and settings
through the same `groups.map`; that path splits into a Sessions workspace and
a Home workspace, each owning its own tab ring. `editorTabs`, `settingsOpen`,
`findEditor` and the rest of the editor plumbing ADR-0017 built inside the
shell move out of the terminal model into the new one. Every guard Option A
would keep adding becomes structurally impossible instead of checked: a group
cannot hold anything but a session, so there is no active tab left to ask "is
this really one" of.

## Decision

Option B.

The reason is the one Option A cannot answer. SFTP does not need a guard, it
needs chrome the group model was never built to hold, and a third instance of
the same bug class showing up before the second one had even shipped is the
model saying it is done generalising. Two rings cost real code today and
remove the entire class of leak by construction rather than by enumeration:
one for a pool of hosts that splits and types into all of them together, one
for a flat list of tasks that never does either.

### What this amends

* **ADR-0020** rule 1 stands: top strip, rail and status bar exist on every
  workspace. What narrows is rule 3, *"everything opened is a tab"*: true
  within a workspace, not across all three, since a Home tab and a Sessions
  group are no longer the same kind of thing. The sentence calling the gear
  "an action rather than a view" is superseded: settings is no longer an
  action bolted onto the sessions sidebar, it is a section of the Home
  workspace, reached by switching to it like any other view. *"There is one
  view here and not three"* stops being a statement about the current build
  and becomes the anatomy: three, the day SFTP ships, two until then.
* **ADR-0021** keeps the shape control in the top strip, and narrows *why* it
  is there. The control divides the Sessions workspace's main area, not "the
  window" in general, since Home and SFTP have no grid to divide, so it
  renders only while Sessions is the active workspace, the same way the sync
  switch now renders only on a group that holds a session. The reasoning that
  the top strip is the one surface belonging to the window and not to
  something inside it still holds; what it owns there is now conditional on
  which workspace is showing.
* **ADR-0017** keeps every host form its own tab, unsaved work attached to the
  host it belongs to, and the drafts living in a pure module rather than a
  hook. What moves is which ring holds that tab: out of the terminal group
  model built for splitting, into Home's own flat strip, which was always the
  better fit and did not exist yet when ADR-0017 was written.
* **ADR-0019** is untouched. Splitting still works exactly as it does today,
  for the one workspace that still does it.

The 280px sidebar column stops being "the session list, permanently"; it
becomes chrome the active workspace owns. Sessions keeps the host list it has
today. What Home or SFTP put there, if anything, is for their own design; this
document does not decide it.

## Consequences

**Good**: the leak class both fixes closed today closes for good instead of
one affordance at a time. SFTP gets a workspace shaped for what it actually
needs (a transfer queue, progress, a cancel button) instead of a tab bar built
for a name and a close button. Home gets a real destination instead of an
action wedged into the sessions sidebar's rail slot. `App.tsx`, already named
as overdue for a split in ADR-0017's own Bad section, finally gets the seam
that follow-up was waiting for. Nothing on disk changes shape: no stored
session, group or setting is read or written differently, so there is no
migration.

**Bad**: this is a real rewrite, not a guard. `focus.ts`'s three-kind ring
splits into two smaller ones, `groups.ts` narrows its held type, and every
place `App.tsx` currently draws an editor or settings tab through the group
path has to move to wherever the Home workspace ends up living. The two
guards landed today, `groupSyncState`'s `null` case and `ShapeControl`'s
`canSplit`, become dead code once groups can no longer hold anything but a
session; removing them is follow-up work, not a side effect of this decision.
The rail grows a second real view before SFTP exists to justify the third,
which is more rail-switching logic to build and test before there is a second
workspace to prove it against.

**Follow-up**:

* Design the Home workspace itself: what the dashboard shows, where the host,
  group and settings tabs live inside it, whether it gets a leading column and
  what that column shows. Not decided here. A first shape shipped anyway, one
  conversation at a time: a nav between Dashboard and Hosts, a card grid on
  the dashboard, Hosts as a list beside one form. #222 is the review that
  shape was always going to need once it existed to look at.
* #127's own ADR designs the SFTP workspace's chrome and decides how it picks
  a host to browse, informed by the connection-sharing constraint noted above.
* Once the Sessions workspace is the only thing holding `HeldGroup`s, remove
  the two guards this ADR made obsolete rather than leaving them as evidence
  nobody followed through.
* Split `App.tsx` along the seam this creates, which ADR-0017 already flagged
  as due.

**Revisit this** if Home or SFTP turn out to want splitting or synchronized
typing of their own. Nothing here forbids a workspace from having its own
version of either; it only forbids sharing the Sessions one.

**Resolved on 2026-08-30, half of it.** `ShapeControl`'s `canSplit` is gone
(#226): it hid the whole control on an empty Sessions workspace, a case
ADR-0021 had already accepted as legitimate on its own, so nothing about the
leak this ADR closed depended on removing it.

`groupSyncState`'s `null` case is not dead code, and this document's own
prediction here was wrong in a way worth naming rather than quietly not
acting on. `Focus` and `HeldGroup` were never actually narrowed: `App.tsx`
stopped routing an editor or settings tab into a Sessions group, but the
types still permit one, so nothing proves the case this guard was written
for can no longer happen, only that it currently does not. And a second,
unrelated case sits behind the same `null` regardless: a rectangle a split
just created, before anything is dragged into it, which has nothing to do
with the leak this ADR closed and would need the guard even if `Focus` were
narrowed tomorrow. See `groupSyncState`'s own doc comment (`groups.ts`) and
the test pinning both reasons separately (`terminal-groups.test.ts`).

The `Focus`/`HeldGroup` narrowing itself, and the `App.tsx` split it was
bundled with above, remain exactly as open as this document already said.

**Resolved on 2026-08-31, the SFTP half.** ADR-0044 gives SFTP its own
workspace, the design this document's Follow-up section named as due, and
with it a Sessions group can no longer hold an `sftp` entry at all:
`Focus`/`HeldGroup` are narrowed for that case specifically. The
`editor`/`settings` half of the same narrowing is untouched and remains
open.
