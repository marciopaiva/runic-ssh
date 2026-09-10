# ADR-0065: Draw broadcast and fan-out as lines between components

* **Status**: Accepted
* **Date**: 2026-09-10

## Context

`docs/plans/map.md` names v0.7.0 "Lines": the second of four releases that
build the spatial interface ADR-0064 opened. v0.6.0 shipped the component, a
window on one saved host in one kind, and the map already stores a `links`
array in `workspace.json`, empty, declared from the first version so this
release adds data and never migrates. What a line means, what it stores and
what it may join was left to this document.

Two earlier decisions already say what the lines will carry, and both are
rules the map must not loosen:

* **ADR-0019, synchronised input.** One switch, off by default, arms typing
  into every pane of a group. The switch disarms itself whenever the set of
  panes changes, each pane can turn itself off in its own header, a receiving
  pane carries the warning edge, and one receiving pane is treated as no
  broadcast at all. `groups.ts` implements this with `inputTargets` and
  `receivingSessions`, keyed by `HeldGroup`, and `App.tsx` holds the switch
  as `sync` and the opt-outs as `muted`.
* **ADR-0045, fan-out.** SFTP sends from one source to up to four
  destinations: one read, one write per destination, concurrently per chunk,
  each destination its own `TransferHandle`, and a question first when more
  than one destination will receive (`PasteConfirm`'s question). The source
  and every destination are an `Endpoint`, which is `{ kind: 'local' }` or a
  remote session; `use-fanout.ts` refuses local to local.

Four things are true in the code today and constrain the answer:

* `Link` is `{ a, b }`, two component ids. `validate` in
  `config/workspace.rs` checks that both exist and differ, and nothing more:
  an SSH component may be linked to a monitor.
* The map's SFTP window transfers nothing. `renderMapSftp` in `App.tsx`
  mounts one `SftpPane` on the host's remote endpoint with `onSend: null`
  and `receiving: null`. The plan made the window one pane on purpose (the
  host's own browser), which leaves upload and download with no second pane
  to go to.
* `Component.host` is the id of a saved session, and `prune` drops any
  component whose host the book no longer has. The machine Runic runs on has
  no session, so it cannot be a component as the model stands.
* The map has no groups. Sessions derives who receives a keystroke from the
  `HeldGroup` that holds the pane; the map has components and links.

The maintainer settled the shape in the prototype
(`runic-proposta-modelo.html`) before v0.6.0: a line joins two components of
the same kind; between terminals it is undirected and carries the switch;
between file browsers it is directed, pulled from origin to destination, and
carries the send button; the local machine is a component; lines never cross
layers. On 2026-09-10 the maintainer confirmed that the local machine must
exist for SFTP. What this document decides is how that shape is stored,
validated and routed, so the two halves of the release (#367, #368) build on
one model.

## Options considered

### Option A: links with a family rule and an ordered pair, the local machine a kind

The stored `Link` stays `{ a, b }`. The rule that gives it meaning: both
ends belong to the same **family**, terminals (`ssh` with `ssh`) or file
browsers (`sftp` and `local` with each other), never a monitor; and for a
file-browser link the order is the direction, `a` the origin and `b` the
destination. Two file browsers may hold two links, one each way. A terminal
link's order carries nothing. `validate` refuses a link across families, a
link from a component to itself, a duplicate, and `local` to `local`.

The local machine is a fourth `ComponentKind`, `local`, whose `host` is
absent: `host` becomes `Option<String>`, omitted when `None` the way `layer`
already is, required for the three remote kinds and forbidden for this one.
At most one per layer. `prune` keeps it, since there is no host to check.
Its window is `SftpPane` on `{ kind: 'local' }`, which already exists.

Broadcast: the connected sets of the terminal links are the groups. The arm
key of a set is its sorted member ids joined, the switch is held per key
and only in memory, and a change to the key is a disarm. Mute is per window.
The map's switch routes only keystrokes typed inside a map window; Sessions'
switch goes on routing only keystrokes typed in a pane. One keystroke never
passes through both.

Transfer: the origin's selection goes to every destination the origin has a
link to, through the dispatch `use-fanout.ts` already has, asking first when
there is more than one.

Costs: the direction is implicit in an order, which a reader of
`workspace.json` has to be told. A `host` that may be absent touches every
caller that reads it, fifteen sites today, and the compiler finds them all.
Forecloses nothing: visions (v0.8.0) group components and their lines as
they are.

### Option B: a map line is a Sessions group underneath

A terminal line creates a `HeldGroup` behind the scenes and `inputTargets`
routes the keystroke as it does for panes; a file-browser line fills one of
the fan-out grid's four destination slots. No new routing code, the ADR-0019
and ADR-0045 tests already cover it.

Costs: `HeldGroup` is a list of open things with an index saying which shows
(ADR-0020), and a line is neither; every map gesture becomes an exception in
a model built for rectangles. The grid caps destinations at four, a number
ADR-0045 took as a starting point, and the line would inherit it as a rule.
Forecloses the cut: v0.9.0 deletes the groups, and the lines would have to
be re-based first, which is the reason ADR-0064 rejected the map as a mode
inside Sessions.

### Option C: no local component; a local pane inside the SFTP window

The SFTP window gains a second pane for the local disk, the shape the SFTP
tab had before ADR-0044, and lines join only remote browsers. The model stays
three kinds and `host` stays required.

Costs: the window stops being one pane, which is what lets it be a
thumbnail, a vision member and a window like the others; two panes in a
window under zoom is the layout problem ADR-0044 left. The local machine
would exist in every SFTP window at once instead of once on the map, so a
download to it from three hosts is three windows, not three lines into one
place. Forecloses the picture the prototype settled and the maintainer
confirmed.

### A variant of A, rejected: a sentinel host id for the local machine

`host: "local"` on a component of kind `sftp`, no new kind, no optional
field. Cheaper by a variant and a few `Option`s. Rejected because `host` is
documented as the id `sessions.json` gave a session, and a value that is not
one turns every reader of the field into a special case that the type does
not announce: the picker would offer to change its host, `prune` would drop
it, and the host popup would open on nothing.

## Decision

Option A.

It is the shape the prototype converged on and the one the stored model was
declared for; the only thing it adds to `workspace.json` is a fourth value
of an existing enum and an optional field, both readable by v0.6.0's file
unchanged. Option B saves routing code now and pays for it in v0.9.0, the
same trade ADR-0064 refused. Option C keeps the model smaller by putting the
local disk in the wrong place.

The tradeoffs accepted: a direction that lives in the order of two fields,
which the doc comment on `Link` states and `validate` enforces, rather than
a field that would mean nothing on half the links; and a `host` that can be
absent, so that a kind with no session is not a session id lying.

The rules, restated once so the two halves of the release cannot drift:

1. A link joins two components of one family. Terminals: `ssh` with `ssh`.
   File browsers: `sftp` and `local` with each other, never `local` with
   `local`. A monitor has no lines; there is nothing for one to carry.
2. For a file-browser link, `a` is the origin and `b` the destination. A
   terminal link has no direction.
3. ADR-0019's rules apply to a terminal set unchanged: off by default, disarm
   when the set changes, mute per window, one receiving window is none. The
   arm state is not persisted; a restart never comes up armed.
4. The map's switch routes keystrokes typed in map windows. Sessions' switch
   routes keystrokes typed in panes. Never both for one keystroke.
5. ADR-0045's mechanics apply to a transfer unchanged: one read, one write
   per destination, a handle per destination, a question first when more
   than one destination receives.
6. The local machine is `kind: 'local'`, `host` absent, at most one per
   layer, kept by `prune`, never a picker's candidate for "change host".
7. Lines never cross layers. v0.7.0 has one layer, so this is a rule
   `validate` will hold from v0.9.0 and the gesture holds from now.
8. A line's handle is drawn in screen space like a window, so it stays
   legible under zoom, and a press on it captures on the handle (#363).

## Consequences

**Good**: `workspace.json` written by v0.6.0 loads unchanged. Nothing in
`ssh/`, `sftp/` or the registry learns that lines exist: a broadcast is the
same `terminal_input` calls, a transfer the same `sftp_transfer`,
`sftp_upload` and `sftp_download`. The map's SFTP window can transfer for
the first time. The two halves of the release share one pure module for
sets, direction and validity, tested without a DOM.

**Bad**: two broadcast switches in one application until v0.9.0, one in
Sessions and one on the map, with the rule that separates them held by
where a keystroke was typed rather than by a type; a test proves the
separation, nothing else does. A `host` that can be absent reaches every
reader of a component. The map's fan-out inherits ADR-0045's unmeasured
load: nothing here says how many destinations a line may reach, and nothing
has measured it. A map with many lines will read badly before visions
(v0.8.0) give them a place to be grouped; that is the release after this
one, not this one. Mute is per window and in memory only, like the switch.

**Follow-up**: #367 builds the terminal line, #368 the file-browser line and
the local machine, #115 the window's context menu with "Broadcast to" and
"Mute this window" as entries. The strings land in `src/locales/en.json`
first, then pt-BR and es. v0.9.0's superseding ADR retires ADR-0019's gesture
(the palette's switch) and ADR-0045's grid, keeping both sets of rules as
the line's. Revisit this decision if the order-as-direction rule causes a
real mistake in a stored file, in which case a `direction` field with a
serde default is the migration-free fix; and if a measurement shows the
fan-out needs a cap, put the cap in `validate`, not in the gesture.
