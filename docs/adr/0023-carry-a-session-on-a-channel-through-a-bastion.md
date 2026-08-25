# ADR-0023: Carry a session on a channel through a bastion

* **Status**: Accepted
* **Date**: 2026-08-25

## Context

Most hosts a system administrator reaches are not reachable directly. One
machine is exposed and hardened, and everything else is behind it. `ProxyJump`
is in nearly every real `~/.ssh/config` for that reason, and without it Runic
SSH cannot connect to the machines its intended user actually administers.

Six things constrain the answer.

**The mechanism is already in the tree's dependencies.** `russh` 0.63 opens a
`direct-tcpip` channel on an authenticated connection, turns it into a stream,
and builds a full client session on any stream. Verified against the local
registry, including the bound that decides whether it is usable at all:
`connect_stream` demands `AsyncRead + AsyncWrite + Unpin + Send + 'static`, and
`ChannelStream`'s `AsyncWrite` is itself conditional on `Send + Sync + 'static`.
A compiled assertion says a channel stream satisfies it. So the far session is
an ordinary `Connection` whose transport happens to be a channel, and
everything below `Connection` works unchanged.

**The bastion must be authenticated before the channel can be opened.** This is
the constraint that shapes everything else. A `direct-tcpip` request on an
unauthenticated connection is refused, so the order is fixed: verify the
bastion's key, authenticate to the bastion, open the channel, verify the
target's key, authenticate to the target.

**That collides with ADR-0008.** `connect_session` returns before
authentication on purpose: the credential is collected in a separate window
after the host key has been verified, so no password is ever typed at a host
nobody has checked. A chain forces the bastion's authentication to happen
inside what is today called "connect", which is the one place the current
design deliberately keeps free of credentials.

**Rule 3 applies twice in one attempt.** Two hosts, two keys, two verdicts. The
existing refusal path carries `OfferedKey`, which already holds the host and
the port, and `HostKeyPrompt` already renders them. What it cannot say is which
*hop* it is asking about, and a prompt that cannot say that is the one that
gets clicked through.

**The credential model is already keyed the right way.** ADR-0004 stores a
secret under `CredentialId::for_session(session_id)`. A bastion that is itself
a saved session therefore has its own credential, resolvable without inventing
anything.

**The pattern this replaces is a known vulnerability, not merely an old
habit.** Before `ProxyJump`, reaching a host behind a bastion meant `ssh -A
bastion` and then `ssh target` from inside it. That places the agent socket on
the bastion, where anyone who can read it can have the agent sign for them and
authenticate elsewhere as the user. It lends the identity rather than the
connection. Nothing in this decision may reintroduce it.

## Options considered

### Option A: the chain lives inside `Connection`, bastion credential from the keychain

`Connection` gains an owned bastion connection. A new constructor takes an
already-authenticated bastion, opens `direct-tcpip`, and builds the far session
on the resulting stream. `connect_session` assembles the whole chain in Rust
and authenticates the bastion from the vault, with no window.

A bastion whose credential is not saved is refused with a typed error naming
what to do about it. That reads like a limitation and mostly is not: a bastion
is crossed dozens of times a day on the way to many hosts, and a password
window per target would be unusable. Saved credentials are how it is actually
used.

Ownership gives the close order for free. Dropping or disconnecting the far
session releases the channel, and the bastion is closed after it, because the
bastion is a field of the thing being closed rather than a sibling somebody has
to remember.

### Option B: the chain lives inside `Connection`, with a second credential window

The same structure, except the bastion may prompt interactively when it has no
saved credential.

It removes Option A's refusal, and it costs an amendment to ADR-0008 from one
credential per connection to one per hop. It also needs the prompt to say which
hop is asking before the feature exists to test that against: two identical
windows in sequence, for two different hosts, is worse than one refusal with an
explanation.

### Option C: the chain is assembled by the frontend, from two handles

Connect the bastion as an ordinary session with its own handle, its own host key
prompt and its own credential window, all of which already work. Then a new
command opens the target over that handle.

Its appeal is real: the entire bastion half needs no new code, and both prompts
are the ones already shipped. What it costs is that the ordering, which is the
security-critical part, moves into the frontend. Disconnect order, what happens
when the bastion handle is abandoned mid-chain, and what closes the bastion when
the target fails all become the responsibility of the side that renders hostile
output. It also produces two handles for one thing the user thinks of as one
session, so the bastion is either a tab nobody asked for or a connection nothing
can close.

## Decision

Option A.

It beat Option C on where the ordering lives. `docs/architecture.md` puts
privileged work in the core, and the sequence "verify, authenticate, forward,
verify, authenticate" is the whole security content of this feature. Moving it
to the frontend to save Rust is trading a known cost for an unknown one in the
place least able to carry it.

It beat Option B on sequencing rather than on merit. B is where this ends up.
But A and B share every structural piece, and they differ only in whether the
bastion may open a window. Shipping A first means the chain exists, with its
limitation written down, before ADR-0008 is amended for a screen that cannot be
tested until the chain exists.

**The tradeoff accepted is that a bastion without a saved credential cannot be
used at all.** Not degraded, not slower: refused, with an error that explains
the one-time fix. That is a real wall in front of a first-time user, and it is
accepted because the alternative is amending the credential model before there
is anything to test the amendment against.

Scope is one hop. `ProxyJump a,b,c` is legal in OpenSSH and is refused here with
a named error rather than connecting to the first and behaving as if the request
had been honoured. A cycle, where two sessions name each other, is refused the
same way.

## Consequences

**Good**: The chain is one `Connection` from every caller's point of view, so
shells, latency probes, byte counters and the future SFTP pane need no knowledge
that a bastion exists. `direct-tcpip` is also the primitive local port
forwarding needs, so this is groundwork rather than a single-use mechanism. The
close order follows from ownership instead of from a rule somebody has to keep.
The agent is never forwarded, and nothing of ours runs on the bastion.

**Bad**: A bastion with no saved credential is refused outright, which is a wall
in front of exactly the person meeting the feature for the first time.

**A machine with no keychain cannot use a jump host at all.** This was found by
running the built feature rather than by reasoning, and it is worse than the
paragraph above rather than another way of saying it. `Vault::availability`
already models a machine with no secret service, and the application already
degrades there to collecting a credential per connection, which works. Under
this decision the chain is the one feature that hard-requires a keychain: the
bastion's credential can only come from one, so on a machine without a secret
service every chained session fails at the first hop. That is a real
asymmetry, it is not what the tradeoff above describes, and it is #165.
`connect_session` now reads the vault, which it never did before, so the command
that was deliberately credential-free no longer is. `Connection` becomes
recursive and `disconnect` becomes ordered, which is a new way to leave a
bastion open. Accepting the target's host key rebuilds the entire chain,
including re-authenticating the bastion, because there is deliberately no
"accept for this session" path. Two hops at twenty seconds each mean a failure
can take forty seconds to arrive.

**Follow-up**: #164, reusing one bastion connection across the hosts behind it,
which this decision makes worse by opening one per session. #165, the machine
with no keychain, which is the strongest argument for Option B and was not
known when this was written. Option B itself, once the host key and credential
screens can say which hop is asking; the conditions to revisit are somebody
having a bastion they cannot save a credential for, or a machine that cannot
save one at all.
Multi-hop chains, if a real configuration turns up that needs them, which
would revisit the one-hop scope rather than this structure.
