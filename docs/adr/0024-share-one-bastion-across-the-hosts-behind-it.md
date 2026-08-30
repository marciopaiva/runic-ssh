# ADR-0024: Share one bastion across the hosts behind it

* **Status**: Accepted
* **Date**: 2026-08-25

Amends ADR-0023. The ownership argument it makes is kept and widened; the
conclusion it drew from that argument changes.

## Context

A bastion exists to front many hosts. ADR-0023 built the chain so that each
far session opens its own connection to the bastion and owns it. Six hosts
behind one bastion therefore mean six connections to it, six authentications,
and six entries in the log a bastion exists to produce.

Four things force this decision now rather than later.

**The cost is not only efficiency.** Because the bastion's credential can come
only from the keychain, a machine with no working secret service cannot use a
jump host at all. That was not named when ADR-0023 was accepted and is #165. A
chain that could ride a bastion somebody had already opened and authenticated
would need no stored credential, because the credential would already have been
used.

**It is already visibly wrong to a person watching.** With the bastion
connected, authenticated, and holding a live shell in a tab, connecting to a
host behind it failed for want of a credential. Both statements were true and
the pair is indefensible: the machine is logged in to the host it says it
cannot get into.

**The exclusive path in the registry exists entirely for authentication.**
`Registry::with` has five callers. Three of them authenticate and need `&mut`.
The other two open a shell and measure a round trip, and both call into `russh`
methods that take `&self`:

| caller | needs |
| --- | --- |
| `commands/terminal.rs` open shell | `&self` |
| `commands/terminal.rs` round trip | `&self` |
| `commands/credential.rs` authenticate | `&mut self` |
| `commands/sessions.rs` authenticate with saved | `&mut self` |
| `commands/sessions.rs` authenticate | `&mut self` |

`russh`'s own `Handle` draws the line in the same place:
`authenticate_password` and `authenticate_publickey` take `&mut self`, while
`channel_open_session`, `channel_open_direct_tcpip`, `disconnect` and
`send_ping` take `&self`. Our types are stricter than the library for no
reason, and the boundary the library already draws is the boundary a shared
bastion needs: a connection becomes shareable exactly when it becomes useful as
a bastion, which is when it has authenticated.

**`Handle` cannot be duplicated.** It holds a `JoinHandle` and a receiver and is
not `Clone`, so a far session cannot hold a copy of the bastion. It either owns
it, shares it, or relies on something else to keep it alive.

Two behaviours must survive, both demonstrated on the maintainer's machine
rather than reasoned about. Connecting to a host behind a bastion with nothing
else open must work, without first being made to open the bastion. And closing
the bastion's tab must not take down the sessions riding it: at the time, a
`top` was running on the far host with the bastion's own session closed.

## Options considered

### Option A: a connection becomes shareable once it has authenticated

`Connection` exposes as `&self` everything `russh` already allows, keeping
`&mut self` for authentication alone. An authenticated bastion is held as
`Arc<Connection>`: the registry holds one share for the bastion's own session
when there is one, and each chain riding it holds another. Closing takes the
share back, and whoever is last closes the connection:

```rust
pub async fn close(this: Arc<Connection>) -> Result<(), ConnectionError> {
    match Arc::try_unwrap(this) {
        Ok(connection) => connection.disconnect().await,
        /* Somebody is still riding it. Letting go of our share is the whole
        of closing, here. */
        Err(_shared) => Ok(()),
    }
}
```

ADR-0023 argued that the close order should be a consequence of ownership
rather than a rule somebody has to remember. That argument survives intact and
gets stronger: it becomes shared ownership, and the count does the remembering.

`Registry` holds `Arc<Connection>` and grows a shared accessor beside the
exclusive one it already has. The exclusive one stays, for authentication.

### Option B: the registry keeps bastions in a second map

A map of open bastions with a reference count of its own, and far sessions hold
nothing, relying on the registry not to drop one that is in use.

It touches fewer types. It also hands back the problem ADR-0023 solved: the
lifetime stops being expressible and becomes a rule in a comment, enforced by
whoever next edits the registry. The first bug it produces is a bastion closed
while something rides it, and that bug is invisible until a session dies.

### Option C: reuse only a bastion that is already an open session

If a handle is open for that saved session, ride it; otherwise do what ADR-0023
does today.

It is the smallest change and it answers the complaint that started this. It
also fails both behaviours that have to survive. Connecting to a host behind a
bastion with nothing open would have to refuse and ask for the bastion first,
which is the interface imposing an order nobody asked for. And closing the
bastion's tab would take down every session riding it, replacing a good surprise
with a bad one.

## Decision

Option A.

It beat Option C on the two behaviours above, both of which exist today and
would regress. It beat Option B on where the lifetime lives: a shared bastion
whose closing depends on a rule is a bastion that will one day be closed under
a session that was using it, and nothing will fail until somebody's terminal
dies.

**The tradeoff accepted is that `Connection` stops being a thing one owner
holds.** That is a real loss. Ownership is what made ADR-0023's close order
provable by reading a type, and shared ownership is a weaker claim than sole
ownership even when it is the correct one. It also means `Arc::try_unwrap` is
load-bearing: a share leaked anywhere, into a task or a cache, is a connection
that never closes and that nothing reports.

## Where a bastion a chain opened lives

Decided while planning, and not in the options above because it only becomes a
question once bastions are shared: a chain that has to open a bastion registers
it as the saved session it is, rather than holding it privately.

Otherwise the second chain to the same bastion cannot find the first one's, and
the sharing this decision exists for would only work when the user happened to
open the bastion themselves. It also stops the core holding a connection it
cannot name, which is half of #168.

It does not put a tab on the strip. Tabs come from the frontend being told a
session opened, and nothing tells it about a bastion nobody asked for. What the
interface should show is #168 and is deliberately still open.

**Amended by ADR-0037 (2026-08-30).** This paragraph was never built (#200):
`Registry::insert` registers the target a chain opens and never the bastion,
so a second chain to a bastion nobody opened by hand still cannot find the
first one's. ADR-0037 answers the lifetime question this section left open,
"nothing would ever take that share back," with a weak lookup rather than a
second strong owner. The rest of this document, the sharing decision and its
ownership argument, stands.

## Consequences

**Good**: Six hosts behind a bastion cost one connection, one authentication and
one line in its log. A chain can ride a bastion the user opened themselves,
which is what somebody watching the screen already believes is happening, and
which lets a machine with no keychain use a jump host at all (#165). Our types
stop being stricter than `russh` for no reason, which is worth having on its
own.

**Bad**: `Connection` is no longer solely owned, so its close order is a
property of a count rather than of a single holder, and a leaked share is a
connection nobody closes and nobody sees. `Registry` grows a second way to reach
a session, and two accessors are two things to choose between correctly. A
bastion that drops now takes several sessions with it instead of one, so the
failure is larger even though it is rarer.

**Follow-up**: #168, the connection nothing on screen admits exists, which this
makes both more important and harder: one invisible connection serving six
sessions has no answer at all to "what is open". #165 is narrowed rather than
closed, since a chain to a bastion that is not currently open still needs a
saved credential or a prompt; Option B of ADR-0023 remains the answer for that
case. The condition to revisit this decision is a leaked share turning up in
practice, which would mean the count is not the right place for the lifetime
after all.
