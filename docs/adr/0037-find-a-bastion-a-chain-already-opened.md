# ADR-0037: Find a bastion a chain already opened

* **Status**: Accepted
* **Date**: 2026-08-30

Amends ADR-0024. The section "Where a bastion a chain opened lives" said what
should happen and left it undone; this is the ADR that section asked for.

## Context

ADR-0024 shares one bastion across the hosts behind it, and named where a
bastion a chain has to open should live: "a chain that has to open a bastion
registers it as the saved session it is, rather than holding it privately.
Otherwise the second chain to the same bastion cannot find the first one's."
That registration was never built (#200). `Registry::insert`
(`ssh/registry.rs:99`) has exactly one call site, `commands/sessions.rs:1029`,
and it registers the target session, never the bastion. `open_bastion`
(`commands/sessions.rs:788`) authenticates a bastion and hands its `Shared`
straight into the target's `Connection.via`; nothing else ever holds it.
`shared_of_session` (`ssh/registry.rs:166`) can therefore only find a bastion
the user opened as a session of their own. Two hosts behind a bastion nobody
opened directly still cost two connections, two authentications and two lines
in the log #164 exists to produce. That is the exact waste ADR-0024 was
written to remove, still present for the one case nobody opens by hand.

ADR-0024 did not leave this undecided by oversight. It named the reason: "the
registry would hold a share of a connection nobody asked for, and nothing
would ever take that share back: the last rider letting go does not remove a
registry entry." That is a real lifetime question, and it is answerable now
that the rest of the sharing mechanism has been read closely enough to see
the shape of the answer.

**What already works, read from the code rather than assumed.** The "last
rider closes it" mechanism ADR-0024 designed is built and correct today, for
the case it was built for. `Shared` is `Arc<Mutex<Option<Connection>>>`
(`ssh/connection.rs:228`). `close_shared` (`ssh/connection.rs:614`) calls
`Arc::try_unwrap`: if this was the last strong reference, it disconnects for
real; if somebody else still holds a clone, it drops its own reference and
does nothing more, trusting whoever holds the last one to call `close_shared`
in turn. `Connection::disconnect` (`ssh/connection.rs:584`) already calls
`close_shared` on its own `via` bastion share, after disconnecting itself,
whether or not that bastion has a registry entry. So a bastion `open_bastion`
opened implicitly today *does* close correctly, the moment the one target
riding it disconnects, purely from `Arc` bookkeeping that owes nothing to the
registry. The gap #200 names is narrower than "this leaks": it is that a
*second* chain to the same bastion has nowhere to look the first one's share
up, so it opens a second one instead of riding the first.

**Which is what makes the lifetime question answerable.** A lookup that adds
a strong `Arc` clone would be the leak ADR-0024 worried about: `try_unwrap`
would never see the count fall to one, so no rider's disconnect would ever
close it, correctness aside from resource exhaustion. A lookup built on
`std::sync::Weak` instead never affects the strong count at all. A second
chain looks the bastion up by the saved session id it corresponds to, calls
`Weak::upgrade`, and either gets a clone to ride (the bastion is still open)
or `None` (every rider already left and closed it, so this chain opens its
own, the way it does today). Nothing has to notice a bastion closing and
remove its entry: a dead `Weak` simply stops upgrading. The map accumulates
one stale entry per bastion that has since closed, which is bytes, not an
open socket, and is worth pruning for tidiness, not for correctness.

## Options considered

### Option A: a weak lookup beside the registry

A new map, keyed by the saved session id a chain-opened bastion corresponds
to, holding `Weak<Mutex<Option<Connection>>>`. `open_bastion` checks it
first and upgrades on a hit; on a miss, or once authenticated on a fresh
open, it inserts its own `Weak` (via `Arc::downgrade` on the `Shared` it is
about to hand to the target). No change to `Registry::insert`, to
`SessionHandle`, or to what the frontend is ever told: this is invisible
below `commands/sessions.rs`.

**Cost**: a new small map and its lock, guarded the same way `Registry`
already guards its own; `Weak::upgrade` at the one call site that matters.
Stale entries accumulate until pruned, which needs a policy (prune on every
insert, or on a timer) but never an operation that must run for correctness.

**Forecloses**: nothing named elsewhere. `Registry` itself is untouched.

### Option B: a `ControlPersist`-shaped interval

The bastion's share is kept alive for a fixed window after its last rider
leaves, so a chain arriving moments later still finds it warm. #164 raised
this and nobody decided it.

**Cost**: real state (a timer per entry, cancelled or renewed by every new
rider) and a parameter nobody has chosen: how long, and whether it should
be user-configurable. It also changes what "closed" means to #168: a
bastion the interface would have to describe as open, carrying nothing,
waiting to see if anyone else arrives.

**Forecloses**: the answer stays open until the interval question is
answered on its own, which is a second decision riding on this one.

### Option C: leave it private, drop the paragraph

Accept that sharing works only for a bastion the user opened themselves, and
correct ADR-0024 to say so.

**Cost**: near zero in code. Reneges on the good ADR-0024 named for itself:
"six hosts behind a bastion cost one connection." That stops being true for
the case that motivated it, a chain crossing a bastion nobody happened to
open by hand.

**Forecloses**: recovers nothing later; the gap stays exactly what #200
found unless this document is revisited again.

## Decision

Option A.

`Weak` is the piece ADR-0024 was missing when it named this a lifetime
question rather than a missing line: it lets a second chain find the first
one's bastion without ever being the thing keeping it open. The mechanism
that actually closes a shared connection, `try_unwrap` inside
`close_shared`, already does the right thing today and does not change.
What changes is only that a chain checks a weak map before opening a bastion
of its own, and leaves a weak trace behind when it does.

## Consequences

**Good**: six hosts behind a bastion nobody opened by hand cost one
connection, one authentication and one log line, closing the gap between
what ADR-0024 promised and what shipped. Nothing about the frontend, the IPC
surface, or a saved session's format moves.

**Bad**: a second map to reason about beside `Registry`, and a second place
a bastion can be reached from, which is exactly the kind of doubled path
ADR-0024's own Bad section already named as a cost of sharing at all. A
stale `Weak` entry sits in the map between a bastion closing and the next
prune, harmless but is one more piece of state existing to explain.

**Follow-up**: decide the pruning policy (on insert is simplest: an
`Arc::downgrade` insert is also a natural moment to drop dead entries found
along the way) as part of implementation, not left open the way #164's
interval was. #168, the connection nothing on screen admits exists, gets no
harder or easier from this: the claim it renders ("this host is carrying at
least one session") stays true either way, which is why #200 could be found
without #168 needing to change first.
