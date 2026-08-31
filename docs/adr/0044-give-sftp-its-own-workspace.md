# ADR-0044: Give SFTP its own workspace

* **Status**: Superseded by ADR-0045
* **Date**: 2026-08-31

**Superseded 2026-08-31 by ADR-0045**: the destination side gets a grid
after all, once a real want for fanning one file out to several hosts at
once showed up. The source side keeps this document's shape exactly (one
pane, no split); read ADR-0045 for what changed and why, and for why this
document's own reasoning, correct at the time for a single-browser
feature, was not simply wrong.

## Context

ADR-0029 split the application into workspaces (Sessions, Home) and named a
third it deliberately did not design yet: *"SFTP gets its own workspace when
#127 designs it, with whatever chrome a transfer needs... #127's own ADR
designs the SFTP workspace's chrome and decides how it picks a host to
browse."* `ActivityRail.tsx`'s own doc comment holds the same line from the
rail's side: *"Two views today, not three. SFTP has no code behind it yet
(#127)... It arrives with the feature."*

#127 shipped (PR #250, PR #253): a session's connected shell can open a
second tab, a dual-pane file browser, through a "⋮" menu on that session's
row in the Sessions sidebar. That tab is a `Focus` entry
(`src/features/chrome/focus.ts`) that occupies a rectangle in the Sessions
workspace's grid exactly like a shell does, placed and sized by the same
`resolveGroups`/`boxOf` machinery ADR-0019 built for splitting a pool of
hosts and typing into several at once.

Nothing about browsing one directory tree benefits from that machinery.
There is no reason to split an SFTP browser into two rectangles, and no
keystroke to broadcast to it. What SFTP's tab actually needs from the
Sessions grid is the one thing the grid was never asked to give up: a
rectangle to sit in, so that something is on screen. Everything else the
grid carries (splitting, the sync switch, `receivingSessions`) is either
irrelevant to it or actively wrong (`receivingSessions` already special-cases
`entry.kind !== 'session'` to keep SFTP out of the keystroke-broadcast set,
a guard whose only job is undoing the coupling this ADR removes instead).

This is the moment ADR-0029 was waiting for.

## Options considered

### Option A: SFTP gets a workspace, but keeps the grid

Give SFTP a rail slot, but let its tab still be placed through
`resolveGroups`/`Box`/`Grid`, with its own `held`/`layout` state separate
from Sessions'. A user could split the SFTP workspace into rectangles the
same way Sessions does, browsing two directories side by side.

Reuses `groups.ts`'s placement code as-is. Costs the same shape control,
grid-resize and multi-rectangle test surface ADR-0019 already paid for in
Sessions, paid a second time for a workspace with no keystroke to route and
no stated want for split browsing. `groups.ts`'s own split-specific
functions (`receivingSessions`, `sparedSessions`, `groupSyncState`) would
either need session-shaped stand-ins that mean nothing for a transfer, or a
second class of "guard against the wrong kind of Focus" bug ADR-0029 already
named as the reason to stop patching the shared model in the first place.

### Option B: one active SFTP session at a time, no grid

The SFTP workspace holds a single visible browser and a sidebar listing
every session with a tab open; picking one from the sidebar switches which
is visible. No splitting, no `HeldGroup`, no shape control. The sidebar
doubles as the workspace's own way to start browsing a host: connect it if
it is not already connected, then open its tab here, rather than reusing
the Sessions "⋮" menu.

Retires SFTP's participation in Sessions' `Focus`/grid entirely:
`stripEntries` stops interleaving an `sftp` entry into the Sessions tab
ring, `boxOf` never resolves one, and the Sessions "⋮" menu drops its SFTP
action. One entry point instead of two to keep in sync. Costs a new,
purpose-built sidebar (`SftpWorkspaceSidebar`) and a small amount of new
state (`sftpFocus: string | null` beside the already-existing `sftpTabs`
set) instead of reusing `groups.ts`, but that state is simpler than what it
replaces, not more: no `Box`, no `Grid`, no split resolution, just "which
one is showing."

## Decision

Option B.

A transfer queue and a directory tree have never asked to be one of four
rectangles, and giving SFTP a workspace only to hand it the same grid
Sessions has would keep every property ADR-0029 wrote this document to
retire: an affordance built for typing into several hosts at once, offered
to a browser with nothing to type into anywhere. The maintainer confirmed
both halves of this directly: the workspace gets its own host picker rather
than reusing the Sessions menu, and it shows one session at a time rather
than a grid.

This also finishes, for the `sftp` case specifically, the narrowing
ADR-0029 announced and then recorded as not actually done ("Resolved on
2026-08-30, half of it"): Sessions' `Focus`/`HeldGroup` will no longer ever
hold an `sftp` entry, closing that instance of the leak class by
construction. The `editor`/`settings` half of that same narrowing remains
exactly as open as ADR-0029 left it; this ADR does not touch it.

### What this amends

Nothing in ADR-0029 itself changes; this is the ADR its own Follow-up
section named as due. It resolves ADR-0029's SFTP-shaped `Focus`/`HeldGroup`
narrowing, the way that document's "Resolved" note already distinguished
from the still-open `editor`/`settings` half.

## Consequences

**Good**: SFTP gets chrome shaped for what it does: a host picker, one
visible browser, the existing dual-pane view and remote-tree sidebar built
for #127, unchanged, instead of borrowing a tab bar and a grid built for
typing into several terminals at once. One entry point (the new workspace's
own sidebar) rather than two half-redundant ones. `receivingSessions`'s
`entry.kind !== 'session'` guard becomes true by construction rather than
by a runtime check: a Sessions group can no longer hold an `sftp` entry at
all, so nothing needs to filter one out.

**Bad**: the "⋮" menu's SFTP action, `session.menu.sftp` and everything
built around it in #250/#253, is retired within two PRs of shipping. A rail
slot and a new sidebar component is more surface than "keep the tab where
it already worked," for a feature that had exactly one release between
gaining a menu entry and losing it. Two workspaces (Sessions, SFTP) can now
hold a connection to the same host at once, and nothing about the "Reaching
\<host\>..." wizard (ADR-0039, ADR-0040) was written with a second workspace
also able to trigger it in mind; #251's own unresolved connect-hang
investigation should be re-read against this once it is picked back up, in
case a second concurrent trigger path turns out to matter.

**Follow-up**:

* `openSftpWorkspace`'s "connect if not already connected" path needs its
  own success callback distinct from `activate`'s (which lands in Sessions,
  focused on a shell); this is new code, not a reuse of `activate`, and its
  interaction with the wizard's own redirect/retry state (ADR-0039,
  ADR-0040) needs the same care those ADRs gave the Sessions path.
* The Sessions grid's `Focus`/`HeldGroup` narrowing is now complete for the
  `sftp` case. The `editor`/`settings` case ADR-0029 left open is unrelated
  and still due.
