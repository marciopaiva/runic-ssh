# ADR-0047: Give SFTP panes navigation, a receive toggle, and a transfers list

* **Status**: Accepted
* **Date**: 2026-08-31

## Context

ADR-0045 shipped one source pane and up to four destination panes, each
independently browsable, fanning a file out to every occupied destination
at once. Reviewing that shape against the toolbar work in ADR-0046 surfaced
four gaps ADR-0045 did not name as follow-up, because nobody had reason to
notice them until the panes were compared against what a maintainer expects
a file browser and a transfer to look like.

**A pane has no way to move except by clicking a row.** `SftpPane.tsx`
shows the current path as inert text; there is no back, no forward, no
breadcrumb, only the `..` row and whatever directory a click opens.

**A fan-out always reaches every occupied destination.** There is no way to
exclude one destination from a single send short of clearing its slot,
which also throws away the browsing context (its own current directory)
that made it worth keeping open.

**A transfer is invisible while it runs.** `use-fanout.ts`'s `transfers`
state, `cancelTransfer` and `dismissTransfer` are fully implemented and the
reducer is tested (`tests/sftp-browser.test.ts`), but `App.tsx`'s render
never reads any of them. A fan-out that is actively copying a file today
shows nothing on screen that says so.

**Sending is a hover-only action on one file.** `Row`'s `onSend` (in
`SftpPane.tsx`) is an icon that only appears on pointer hover, one row at a
time. There is no way to start more than one file's transfer together, and
nothing about the affordance is visible without a pointer already over the
row.

## Options considered

### Option A: fix only the transfers-list visibility

The narrowest read of "this is a bug, not a design gap": wire
`fanout.transfers` into a rendered list and stop there. Cheapest, and
closes the one gap that is a correctness problem (a running transfer with
no feedback) rather than a missing capability. Leaves navigation, the
per-destination toggle and multi-file sending undesigned.

### Option B: add all four, as one pass

Draw and accept navigation, a per-destination receive toggle, the
transfers list, and checkbox-driven multi-file sending together, since a
maintainer review of the toolbar work asked for all four in the same
sitting and they touch the same panes.

### Option C: multi-file sending as a second mode, hover-send unchanged

Keep `Row`'s hover-only send icon for the single-file case and add
checkboxes plus a send bar as an additional, separate path for several
files at once. Avoids retraining the single-file gesture, at the cost of
two different ways to start the same action on the same row.

## Decision

Option B, with Option C's alternative rejected on the same reasoning
ADR-0046 gave for not stacking a second broadcast control on top of the
first where one would do: two ways to start a send is worse than one,
and the checkbox path already covers the single-file case (check one row,
press Send).

**Navigation.** Each pane gains a bar below its identity header: back and
up (chevrons, greyed when unavailable), a clickable breadcrumb of the
current path, and refresh. The `..` row in the listing is kept, unchanged,
rather than removed in the same pass; whether it becomes redundant once
the toolbar exists is left for a maintainer to judge after living with
both, not decided here. Back needs navigation history `usePane` does not
carry today (it holds only the current listing and its immediate parent);
this is new state on that hook, not just a rendering change, tracked in
Follow-up.

**Per-destination receive toggle.** Each destination pane's header gains
the same broadcast glyph ADR-0046 gives Sessions' `sync_pill`/toolbar
button, colour-only on/off, on the trailing edge before its clear button.
Occupying a slot defaults it to on, the same "arming starts with everyone
included" rule Sessions already follows. The source pane draws no icon:
it only ever sends, and the question this icon answers does not apply to
it. `sendToDestinations` reads the toggle the same way Sessions'
`inputTargets` already reads `muted`, skipping a destination that is
occupied but toggled off.

The toolbar gains a matching "select every occupied destination" shortcut
(`select_all_button()` in the canvas). It is deliberately not warn-tinted
the way Sessions' toolbar broadcast control is: SFTP has no keystroke
stream to arm, since sending a file is already a one-shot action rather
than a continuous broadcast, so nothing here should claim a persistent
mode that does not exist.

**Transfers list.** One shared bar, full width, below both columns, not
one per pane: `TransferState` already names its own destination per row
(ADR-0045), so a single list loses nothing a per-pane one would keep, and
it is the only place that can show every active transfer at a glance.
Rows draw only fields `TransferState` actually carries (direction, name,
destination, a progress bar built from transferred/total): no invented
speed column, unlike the pre-fanout canvas artboard's fabricated
"1,4 MB/s," which is exactly what rule 6 of ADR-0020 (the layout may
reserve room to think and may not show interface that lies) exists to
catch.

**Multi-file sending.** A checkbox appears on each file row in the source
pane (directories are not selectable this way; opening one is still a
click). Checking one or more reveals a send bar at the bottom of the
source pane: a count, a Clear action, and one primary Send button in the
wizard's own primary-button style. This replaces `Row`'s hover-only send
icon rather than sitting beside it.

### What this amends

Nothing in ADR-0045's own decision changes: source stays one pane,
destinations stay a grid of up to four, fan-out still writes to every
destination concurrently per chunk. These four additions fill gaps that
decision left unnamed rather than reversing anything in it. The toolbar
placement of `select_all_button()` follows ADR-0046's own toolbar
decision; this document does not re-argue that placement, only what the
button does for SFTP specifically.

## Consequences

**Good**: a pane can be navigated without depending on what happens to be
one click away. A maintainer can keep several destinations open for
context without every send reaching all of them. A running transfer is
visible for the first time since ADR-0045 shipped it invisibly. Starting a
send on more than one file at once is possible and discoverable without a
pointer already hovering a row.

**Bad**: `usePane` grows navigation-history state it did not carry before,
which is new surface to test, not a pure rendering change. The `..` row
and the new up button now say the same thing two ways in the same pane,
kept on purpose rather than resolved, which is itself a small inconsistency
until somebody judges it worth removing one. Checkbox-driven sending is a
larger interaction change to `SftpPane.tsx` than any single line item
above suggests, since it replaces rather than adds to the row's existing
click behaviour.

**Follow-up**:

* `usePane` needs a navigation-history stack (most likely an array of
  visited paths plus a cursor) to back the nav bar's back/forward buttons;
  `goUp` already gives the up button what it needs and does not change.
* `fanout.transfers`/`cancelTransfer`/`dismissTransfer` need an actual
  rendered `TransferRow`/`TransfersBar` component wired into `App.tsx`'s
  SFTP render, plus a per-destination `receiving`-shaped set threaded
  through `useFanout` for `sendToDestinations` to read the same way
  Sessions' `inputTargets` reads `muted`.
* `SftpPane.tsx`'s `Row` needs a selection state (which paths are checked)
  lifted to wherever `sendToDestinations` is called from, and its existing
  hover-only send icon removed once the checkbox path replaces it.
* A throughput measurement at higher destination counts, unifying
  `sftp_download`/`sftp_upload`/`sftp_transfer` behind one endpoint-typed
  command, and group-level cancellation in `Transfers`: ADR-0045's own
  follow-up items, still open, unrelated to this document's four additions.
