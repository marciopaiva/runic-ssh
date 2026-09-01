# ADR-0046: Put workspace controls in a shared toolbar, and give SFTP the Sessions sidebar

* **Status**: Accepted
* **Date**: 2026-08-31

## Context

Two things drifted out of step while ADR-0045 shipped SFTP's fan-out, and a
maintainer review of the result (against a hand-drawn reference for what the
Sessions Titlebar should look like) is what surfaced both.

`SftpSplitControl`, added for the destination grid's row count, was placed
inline in the SFTP workspace's body, beside the destination column's own
header. This is the exact placement ADR-0021 already ruled out for a
different control: *"a button sitting on one group's strip reads as split
this rectangle"* is the same objection to a split control sitting beside
one column of a two-column workspace. Nobody meant to repeat ADR-0021's
mistake; nobody had reason to think about it until the two controls were
compared directly.

Separately, `SftpWorkspaceSidebar` has drawn a plainer host list than
`SessionsSidebar` since ADR-0044, on the reasoning that a host picked to
browse rather than to type into does not need a kind icon or a jump-chain
mark. A maintainer review of both side by side judged that reasoning no
longer worth the inconsistency: two sidebars that both list saved hosts,
drawn two different ways, is its own kind of thing to keep in sync by hand.

A third gap came from asking where a global "arm broadcast for everyone"
control should live, now that a toolbar exists. ADR-0021's own history
already answered this once: a global sync switch spent one day in the top
strip and was reversed the next, because *"which of them receive is a real
question about each one... a control repeated four times that means one
thing four times is what this document refused."* That reasoning still
holds for a control that *only* arms everyone with no per-rectangle
opt-out. It does not, on inspection, rule out a toolbar shortcut that
starts or stops everyone at once *alongside* the per-rectangle switch
`SyncToggle` already is: two different questions, not the same control
moved back.

## Options considered

### Option A: leave each control where ADR-0021/ADR-0044 put it

Cheapest. Leaves the SFTP split control repeating the mistake ADR-0021
named for a different control, and leaves two visually unrelated sidebars
answering the same question ("pick a saved host").

### Option B: a workspace-specific home for each control

Sessions keeps its `ShapeControl` in the Titlebar; SFTP gets its own
per-workspace strip for its own controls. Fixes the split-control
placement without touching Sessions, but manufactures a second convention
(SFTP's controls live in a strip, Sessions' live in the Titlebar) where the
whole point was to stop workspaces from each inventing their own answer to
"where do this workspace's own controls go."

### Option C: one shared toolbar row, between the Titlebar and every
workspace's body; SFTP's sidebar adopts `SessionsSidebar`'s pattern

A new 34px row, always present under the Titlebar for Sessions and SFTP
(Home keeps `HomeNav`, its own pattern, unchanged: it is a section switch
inside the workspace's own body, not a control over the workspace itself,
and ADR-0029 already gave it that shape on purpose). `ShapeControl` and
`SftpSplitControl` both move into it, at the trailing edge, matching where
`ShapeControl` already sits today. `SftpWorkspaceSidebar` is retired in
favour of the same `SessionsSidebar` (kind icon, jump/target mark, chain
indent, filter, groups) SFTP's own host list already needed to answer the
same question a saved-host row in Sessions answers.

## Decision

Option C, confirmed against exploratory canvas artboards
(`SftpProposal.dc.html`, `SessionsProposal.dc.html`,
`SessionsProposalBroadcast.dc.html`,
`SessionsProposalBroadcastMulti.dc.html`) before any code changed.

**The toolbar** sits between the Titlebar and the rail/sidebar/body row,
full width, present for Sessions and SFTP. Each workspace supplies its own
trailing content (`ShapeControl` for Sessions, the destination split
control for SFTP) and may reserve leading content for something specific
to it; nothing currently occupies that leading slot for either workspace,
and this document does not commit one to it.

**The split control folds, matching `ShapeControl`.** `SftpSplitControl`
first moved into the toolbar as the same four always-visible buttons it
drew inline beside the destination column, since that was what the split
control had always been. Sitting beside `ShapeControl`, folded to one
button since ADR-0022, made that a second rule for the same kind of
question ("how many pieces does this area divide into") in the same bar.
Confirmed directly: `SftpSplitControl` now folds too, mirroring
`ShapeControl`'s own structure exactly (a button showing the current
choice, a popover listing the rest, `Escape` and outside-click both
close it). ADR-0022 stands as it was reasoned, rather than being
revisited for the toolbar's own extra width: the fold is now the shared
answer for "choose one of a small, fixed set of layout options here,"
independent of whether the bar it sits in happens to be cramped.

**The SFTP sidebar** becomes the same `SessionsSidebar` component Sessions
already uses. `SftpWorkspaceSidebar`'s own reasoning for a plainer list
(a host picked to browse "does not mean" a kind icon or a jump mark) is
overridden directly: visual consistency between the two workspaces'
host lists outweighs the marginal noise those marks add to a browsing
picker.

**Broadcast keeps two controls, not one.** `SyncToggle`'s own per-rectangle
switch is unchanged and unmoved: it still answers "does this rectangle
receive," the same question ADR-0021's history already settled belongs on
the rectangle. A new toolbar shortcut, before the split/shape control,
starts or stops every open, non-empty group at once, exposing what
`toggleSync` already does today from the command palette alone. The two
do not conflict because they answer different questions: pressing the
toolbar shortcut arms everyone (arming has always started with everyone
included, ADR-0019); pressing one group's own switch afterward still opts
just that rectangle out. The toolbar shortcut also gets a matching icon
language: both it and `SyncToggle` draw the same broadcast glyph, told
apart by colour alone (`T['warn']` when active) rather than two shapes
that both mean "is this receiving": `SyncToggle.tsx` itself still draws a
pill-and-knob switch and needs the matching change, tracked as follow-up
below.

SFTP's own toolbar shortcut (`select_all_button()` in the canvas, not yet
named in code) is a different thing wearing a similar shape: SFTP has no
keystroke stream to arm, since sending a file is already a one-shot action
per file rather than a continuous broadcast. It is deliberately not
warn-tinted, and is described fully in ADR-0047.

**A group holding exactly one tab gets a stretched identity bar** ("Option
1" against `SessionsProposal.dc.html`, confirmed directly during the same
review and missing from this document's own text until now, which is why
it went unbuilt through #259): `GroupStrip`'s packed, left-aligned tab
layout collapses into a single full-width bar (a state dot, the name, the
address, `SyncToggle` and the close action) once a group has nothing else
to pack against. Two or more tabs, and a lone host form or settings tab,
keep the packed strip unchanged: the address this bar makes room for only
exists for a session, and there is nothing to distinguish among tabs that
are not there.

### What this amends

**ADR-0021** said the shape control belongs in the top strip, because that
is "the only surface in the window that belongs to the window rather than
to something inside it." The new toolbar is a second such surface, and the
shape control moves into it rather than staying literally inside the
Titlebar. ADR-0021's Bad #1 named the shape control's own cost against the
Titlebar's job of being dragged (*"Four buttons is around 112px of a bar
whose remaining job is being dragged"*); moving it out into its own row
gives that drag surface back, which that document did not anticipate as an
available fix. ADR-0021's history of the sync switch (tried in the top
strip, reversed the next day, settled on the group's own strip) is not
reopened: `SyncToggle` does not move. What is new is a second, additional
control in the toolbar that answers a different question, described above.

**ADR-0044** gave SFTP a workspace with its own, deliberately plainer
sidebar. That decision's core (SFTP is its own workspace, ADR-0045's fan-out
model, one source and a grid of destinations) is untouched. Only the
sidebar's own chrome changes, in favour of the pattern `SessionsSidebar`
already settled.

## Consequences

**Good**: one answer, not three, to "where does a workspace's own control
live" (Titlebar-only for Sessions, in-body for SFTP, `HomeNav` for Home,
now collapsed to: the toolbar for Sessions and SFTP, `HomeNav` still for
Home because it answers a different question). One sidebar component
serves both workspaces instead of two that have to be kept looking alike
by hand. The Titlebar gets its drag surface back. `toggleSync` gets a
visible, discoverable control for the first time since it shipped.

**Bad**: every Sessions and SFTP screen gains a fixed 34px row, including
ones with nothing yet to control (an empty Sessions workspace, freshly
opened, ADR-0021's own Bad #2 already accepted this cost once for the
shape control alone; it now also applies to whatever a workspace's toolbar
shows). `SftpWorkspaceSidebar` and its own doc-commented reasoning are
retired within one release of being written, the same short lifespan
ADR-0044's Bad section already named for the "⋮" menu action it replaced.

**Follow-up**:

* `SyncToggle.tsx` drew a pill-and-knob switch until 2026-09-01, on its own
  reasoned argument for that shape specifically, which this document had
  not revisited. The maintainer confirmed directly that the canvas
  approved for both Sessions and SFTP stands, which settled it: `SyncToggle`
  now draws the same broadcast glyph the toolbar control and SFTP's
  per-destination toggle already do, colour-only on/off. No longer
  outstanding.
* `sessions_header()` and `strip()` (`design/canvas/gen.py`) were both
  found stale against the real `SessionsSidebar.tsx`/`GroupStrip.tsx` (a
  chrome row the command palette retired, drawn on regardless).
  `sessions_header()` was fixed during this pass; `strip()`'s identical
  staleness and `canvas.json`'s missing `SftpWorkspace.dc.html`/
  `SftpFanout.dc.html` entries were fixed in #266.
* The published `runic-ssh-interface.html` is stale (2026-08-22, predates
  this document entirely) and still cannot be regenerated: it depends on a
  `support.js` this checkout does not have. Tracked in #262.
* This document's own Decision section did not mention the solo-tab
  identity bar until 2026-09-01, even though it was decided in the same
  review and drawn in every `SessionsProposal*.dc.html` artboard from the
  start: a decision made in conversation is not on record until it is
  written down, and #259 shipped everything else this document said
  without it. Added above, and implemented the same day it was noticed
  missing.
