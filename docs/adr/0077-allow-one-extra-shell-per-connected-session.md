# ADR-0077: Allow one extra shell per connected session

* **Status**: Accepted
* **Date**: 2026-09-23

## Context

ADR-0014 refuses a second shell on a connection handle. The guard is
`Registry::has_shell` in `src-tauri/src/ssh/registry.rs`, which checks
`Entry.input: Option<Sender>` (set once when a shell attaches and never
cleared), and `open_terminal` in `src-tauri/src/commands/terminal.rs` returns
`TerminalAlreadyOpen` when it is already set. That guard exists because of
#94: switching tabs used to open a second shell and abandon the first, which
kept running, held a pty, and counted twice against the server's
`MaxSessions`.

Issue #120 asks for the deliberate version of the thing ADR-0014 refused by
accident: a second shell on a connection already open, multiplexed over the
transport that exists rather than opened as a second socket with a second
authentication. The transport side already supports this. `Connection` keeps
the russh `Handle` alive for the life of the session, so
`channel_open_session()` can be called again on it, and `docs/architecture.md`
already states that channels within a session are multiplexed by russh for
exactly this reason.

ADR-0019 recorded this as out of scope for its own pane work and wrote down
what it would cost: `Entry.input` becoming a map instead of one
`Option<Sender>`, `terminal://output` and `terminal://closed` needing to carry
a second key alongside `handle`, and `terminal_flood.rs`, which drives one
pump against one channel with one receiver moved in, not covering two pumps
on one connection.

That estimate is no longer complete. ADR-0020 superseded ADR-0019's data
model: fixed pane slots became "groups" (`src/features/terminal/groups.ts`),
and the model ADR-0020 introduced is more restrictive on this specific point
than the one it replaced. `Focus` for a session
(`src/features/chrome/focus.ts`) is `{ kind: 'session', sessionId }`, with no
second axis of identity, and `sameFocus`, `resolveGroups`, `placeEntry`,
`removeEntry` and `groupOf` in `groups.ts`, plus `mountedTerminals` in
`mounted.ts`, all dedupe and mount strictly one tab per `sessionId`. Giving a
second shell of the same session its own tab needs `Focus`, `sameFocus`,
`tabElementId`, `panelElementId`, `stripEntries`, `mountedTerminals` and the
group dedupe logic extended with an identity axis that does not exist today:
frontend work beyond what ADR-0019 or the issue body priced in, because both
predate ADR-0020.

ADR-0014's own Consequences section left a question open: "whether output
from an abandoned shell could reach a live terminal was never established...
the two pumps emitting on one handle was never proven impossible by any other
route." That question was about an abandoned shell. A deliberate second shell
makes it a question about two live shells running concurrently, which is a
harder version of the same question.

## Options considered

### Option A: an arbitrary number of shells per session

`Entry.input` becomes `HashMap<ShellId, Sender>` with `ShellId` a free
identifier, `terminal://output`/`terminal://closed` carry it, and the
frontend gains a management UI to open, name, reorder and close any number of
shells on one session.

This is the superset of what #120 asks for, and it does not cost more on the
backend or in the frontend identity model than the option below: the same
map, the same second event key, the same extension to `Focus` and the group
dedupe logic are needed either way. What it adds on top is a UI for managing
an open-ended list, and an unanswered question ADR-0019 already flagged and
this ADR would otherwise still leave open: what bounds the number of shells a
client will let one session hold. Nothing server-side answers this, since
`MaxSessions` is the host's limit, not ours, so Option A ships with either an
arbitrary cap invented for the occasion or no cap at all.

### Option B: exactly one extra shell per session (chosen)

The same backend and IPC rework as Option A, but `ShellId` collapses to a
`primary` / `secondary` marker instead of a free identifier. The UI offers one
action, "duplicate this shell", which always produces the same result: a
second, fixed tab. There is no third.

Closing the primary shell closes the session as it does today, and the
secondary's tab goes with it; there is no promotion of the secondary to
primary, which is complexity nobody asked for. Closing the secondary closes
only its own channel and leaves the primary and the connection untouched. The
secondary is a `Focus` in its own right and gets its own tab, but it is not a
target or a source of the armed broadcast: `broadcast()`, `sendEach` and
`inputTargets` in `src/App.tsx` and `src/features/terminal/groups.ts` resolve
a session to a shell to type into through `mounted.find(candidate =>
candidate.sessionId === sessionId)`, which is a one `sessionId` to one
`handle` lookup today, and both shells of a session share the same `handle`
(same connection, multiplexed channels). Making the secondary a broadcast
participant needs that lookup to resolve `(sessionId, slot)` instead of
`sessionId`, which means `MountedTerminal` and `Tab` carrying a slot and
`receivingSessions`/`inputTargets` returning `Focus[]` instead of `string[]`:
a second refactor across `App.tsx`, `groups.ts`, `mounted.ts` and
`chrome/tabs.ts`, discovered only once those call sites were read for Phase 3
and priced separately from what this ADR budgets. The secondary is treated
like a personal, exploratory shell instead: always spared, never a target,
regardless of sync or mute state. Naming follows the existing `groupLabel`
pattern (session name plus `user@host`) with a suffix distinguishing the
second tab, which needs one new locale key.

This answers "how many shells per session" by construction instead of by a
policy that has to be invented and then enforced, at the cost of foreclosing
a smooth path to Option A later: a third shell would mean `ShellId` moving
from a boolean back to a free identifier, which is a second migration of the
same state, not an extension of this one.

### Option C: defer

Leave ADR-0014 as it stands and close or park #120, recording the ADR-0020
finding above as the reason to revisit later. Costs nothing now. Leaves the
issue, and the maintainer's stated interest in it, unanswered.

## Decision

Option B.

The backend, IPC and frontend-identity cost is identical between A and B:
`Entry.input` as a map, events keyed by a second id, and `Focus` gaining a
second identity axis are all needed either way. The entire difference between
them is product surface, and B resolves the question ADR-0019 left open, what
bounds the number of shells, by construction rather than by a policy,
in exchange for accepting that a future third shell is a second migration
rather than a natural extension of this one. That is the tradeoff: less
product surface to design and review now, paid for with less room to grow
later without touching this decision again.

## Consequences

**Good**: the amendment to ADR-0014 is scoped and reviewable: "refuse a
second shell" becomes "refuse a third shell, allow exactly one second shell
per connection", rather than an open-ended capability. The "how many" and
"what bounds it" questions both disappear instead of needing an answer. The
group and focus model gains one boolean rather than an open collection. This
ADR is what makes it correct to say that `has_shell` in `registry.rs` no
longer answers the question its caller needs and has to become keyed. Keeping
the secondary shell out of the armed broadcast keeps `mounted`,
`receivingSessions` and `inputTargets` addressed by plain `sessionId`, so
nothing in `App.tsx`'s broadcast path changes shape for this ADR.

**Bad**: `terminal://output` and `terminal://closed` break their existing
single-argument contract for the one caller that has ever used it
(`src/ipc/terminal.ts`). `terminal_flood.rs`'s pump tests drive one pump
against one channel with one receiver and do not cover two pumps against one
connection; that coverage does not exist yet and has to be written before
this is provably safe, not after. ADR-0014's own open follow-up (whether
output from one shell could reach the wrong terminal by some route neither
ADR proved impossible) was about an abandoned shell and stays unresolved
here for a harder case: two shells genuinely live and reading the same
channel-multiplexed connection at once.

**Follow-up**: this ADR does not touch `MaxSessions` or any server-side
session accounting; it records only that two shells per connection is this
client's own, self-imposed bound. A request for a third shell needs its own
ADR, because moving `ShellId` from a boolean to a free identifier is exactly
the kind of decision ADR-0014 already teaches should not be improvised inside
an edit. `terminal_flood.rs` and `src/features/terminal/flood.ts` need a
two-pump, two-terminal measurement added before implementation is reported as
proven, per ADR-0014's own unresolved follow-up above. Making the secondary
shell a broadcast participant, if that is ever wanted, is its own follow-up:
it needs `(sessionId, slot)` addressing through `mounted`, `Tab` and
`inputTargets` rather than the `sessionId`-only lookup this ADR keeps.
