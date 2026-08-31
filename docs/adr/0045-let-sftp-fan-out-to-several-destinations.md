# ADR-0045: Let SFTP fan out to several destinations

* **Status**: Accepted
* **Date**: 2026-08-31

## Context

ADR-0044 gave SFTP its own workspace on a specific, narrow shape: one
active browser, always the user's own machine on one side and one
connected session on the other, no grid, no split. That shape came from
the feature as it existed at the time: browse one host, move a file
between it and the local disk.

Working through that shape live surfaced a bigger want. Copying the same
file to several servers at once, or between two remote hosts with nothing
local involved, are ordinary things to want from an SFTP client, and
ADR-0044's own Option A already named the mechanism this would need
(`groups.ts`'s grid). It was rejected there for a single-browser feature
with nothing to split, not because the mechanism was wrong for a future
one. This document is that future one.

Three things ADR-0044 assumed no longer hold:

* **Exactly one remote side.** `sftp_download`/`sftp_upload`
  (`src-tauri/src/commands/sftp.rs`) each hardcode one side of a transfer
  to the local filesystem, via a bare path string rather than a second
  session handle. Directory *listing* already has no such limit:
  `sftp_list` takes a `SessionHandle` and is fully generic per handle, the
  same way a jump-host chain already keeps two connections open at once.
  Only the transfer commands are narrow.
* **One visible browser.** Fanning a file out to several destinations
  means several destinations on screen at once, each showing where it
  currently is, independently of the others.
* **No grid.** The mechanism ADR-0044's Option A described (reuse
  `groups.ts`'s `Box`/`Grid` geometry) is the right one for laying out
  several destination panes. What ADR-0044 got right to reject is
  `HeldGroup`'s *behaviour*: a Sessions rectangle holds a list of tabs, and
  dropping a new one onto it keeps the old one as a hidden tab in the same
  rectangle. Confirmed directly against this feature: a destination slot
  should not do that. Dropping a host onto an occupied slot replaces it
  outright. There is no reason to keep a destination around that a person
  just dragged something else on top of.

## Options considered

### Option A: keep one visible browser, add a second command for remote-to-remote

Ship `sftp_transfer` (source handle, source path, destination handle,
destination directory) so remote-to-remote works, but leave the UI as
ADR-0044 shipped it: one browser, one destination at a time, chosen from
the same picker.

Cheapest change, and it answers the "remote-to-remote" want on its own.
It does not answer "one source, several destinations at once," which is
the more specific thing that was actually asked for, and building the
picker twice (once for "pick the one destination," later for "pick up to
four") is two rounds of UI work for one feature.

### Option B: a grid of destination panes, reusing `groups.ts`'s geometry but not its tab-stacking

One source pane, always exactly one. A destination area that starts with
one empty slot and grows to a grid as hosts are dragged in, capped at four
to start. Each slot holds at most one occupant, a plain
`readonly (Endpoint | null)[]` rather than a `HeldGroup`, so
`Box`/`Grid`/`cells` from `groups.ts` lay the rectangles out, but placing
an entry is nothing more than replacing one array slot, not `moveEntry`'s
detach-and-append-to-a-list behaviour. `Endpoint` (`{kind:'local'}` or
`{kind:'remote', sessionId, handle}`) replaces the hardcoded local/remote
pair everywhere: the source is an `Endpoint`, every destination slot is an
`Endpoint | null`, and `sftp_download`/`sftp_upload`/the new
`sftp_transfer` are three cases of the same "copy from one endpoint's
current directory to another's" operation, chosen by which pair of kinds
is in play.

Costs the real rewrite named below: `use-browser.ts` and `SftpBrowser.tsx`
were built around exactly two named sides and become per-pane instead,
`SftpWorkspaceSidebar` gets its drag-and-drop back, and `attemptSurface`
needs to know which pane a connection attempt belongs to instead of
assuming there is only one rectangle.

## Decision

Option B.

Remote-to-remote alone would leave the picker still answering last week's
question. The fuller shape (free source and destination, several
destinations at once, filled by dragging the same way Sessions already
does) is what was actually asked for, and `groups.ts` already has the
geometry half of what it needs: this is not new machinery, it is the
placement-list half of `HeldGroup` traded for a plainer one that matches
"replace, don't stack" instead of building a second stacking model
alongside the first.

Four destinations is a number to test against, not a limit taken on faith.
ADR-0019 shipped four panes from a real throughput measurement and
ADR-0022 later raised it to six and nine once a second measurement said
the headroom was there; nothing in this repository has ever measured SFTP
listing/transfer load the way `docs/measurements/terminal-throughput.md`
measured terminal painting, so four here is a starting point in the same
spirit, not a load-bearing number.

**Fan-out mechanics**, decided now so the implementation has an answer
rather than a guess:

* One read from the source, one write to every occupied destination,
  concurrently per chunk (`tokio::join!`/`join_all` across the writes, not
  a chain of awaits), so a slow destination does not throttle a fast one.
* Each destination is its own `TransferHandle`, not a new group-cancel
  primitive in `Transfers`. A partial failure on one destination does not
  retroactively fail the others; cancelling "this copy" from the UI cancels
  each handle in the group, one call per handle.
* The destination-remote name-safety question that remote-to-remote raises
  is already answered by the `check_name` call `upload` already makes on
  the name half of a destination path before joining it. The same check,
  run on the source-supplied name, is sufficient; no new path-join
  primitive is needed for a remote path string the way `safe_destination`
  exists for a local one.

### What this amends

**ADR-0044 is superseded by this document.** Its core answer to "does SFTP
need a grid" was no; this document's answer, for destinations specifically,
is yes. The source side keeps ADR-0044's shape exactly (one pane, no
split); this is not a full reversal, only the destination half. ADR-0044
is not rewritten or deleted: the reasoning that was correct for a
single-browser feature with nothing to split stays on record as exactly
that, and the "Resolved" note pattern this repository already uses for
ADR-0029 is not appropriate here because the core decision itself changes,
not a follow-up item.

ADR-0029's own point still holds unchanged: *"Revisit this if Home or SFTP
turn out to want splitting... of their own. Nothing here forbids a
workspace from having its own version of either; it only forbids sharing
the Sessions one."* This is SFTP's own grid, built from the same geometry
primitives, still never sharing Sessions' `HeldGroup`/`Focus`.

## Consequences

**Good**: source and destination are symmetric concepts (`Endpoint`)
instead of two hardcoded named sides, which is what makes remote-to-remote
representable at all rather than a special case bolted on. Fanning out to
several destinations reuses the exact same per-destination transfer call
as a single one: nothing about the backend changes shape between "one
destination" and "four." `SftpWorkspaceSidebar` regains parity with
`SessionsSidebar`'s own drag-and-drop instead of being a plainer, click-only
cousin of it.

**Bad**: `use-browser.ts` and `SftpBrowser.tsx`, both written for #127 and
extended for ADR-0044, are restructured again within days of the second
version shipping; the pane model changes shape twice in one week. A drop
on an occupied slot destroying what was there with no undo is a real loss
of work if it happens by accident, in a way Sessions' own "the old one
becomes a hidden tab" behaviour never risked; this trades safety for
directness on the maintainer's own explicit choice. `Transfers`'
per-handle-only cancellation means "cancel this copy" is N cancel calls
made to look like one from the UI, not an atomic operation. A destination
whose cancel call is lost mid-flight (an unlikely but real race) keeps
running while its siblings stop.

**Follow-up**:

* A real measurement of SFTP listing/transfer load at increasing
  destination counts, the way `docs/measurements/terminal-throughput.md`
  did for terminal painting, before treating four as settled either way.
* `sftp_download`/`sftp_upload` and the new `sftp_transfer` are three
  separate commands for three cases of one operation; whether to unify
  them behind one `Endpoint`-typed command later, once the frontend's own
  `Endpoint` type has proven the shape out, is not decided here.
* Group-level cancellation in `Transfers`, if the per-handle approach's
  "N calls standing in for one" turns out to matter in practice.
