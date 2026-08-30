# ADR-0033: Ask a bastion's credential inline too

* **Status**: Accepted
* **Date**: 2026-08-29

## Context

ADR-0032 moved the wizard's own credential off the separate window: step 3
collects it inline, once `connectSession` has returned a handle, through
`authenticateSession` directly. That works because ADR-0008 already returns
the target's handle *before* authenticating it. The target's credential was
always a separate step from opening the connection, and ADR-0032 only moved
where that separate step happens.

A session behind a jump host does not have that seam. `open_bastion`
authenticates the bastion *inside* `connect_session`'s own call, before the
target is ever reached, because ADR-0023's whole argument is the order:
bastion key, bastion credential, channel, target key, target credential, in
that sequence, with no gap in it a caller could use to ask for the bastion's
secret some other way. When nothing is saved for the bastion, `open_bastion`
calls `ask()`, which opens the separate window and awaits its answer, and it
does this whether the caller is Sessions or the wizard, because until now
nothing told it there was a difference.

Driving a wizard test through a session with a jump host surfaced exactly
that: the target's own field is inline, and the bastion's is a window
dropped on top of it: the two pieces of one connection, presented two
different ways, mid-test. The maintainer's ask, seeing that: one place, not
two. Sessions asks for a password when one is actually needed, and
everything else the wizard already resolved stays resolved.

## Options considered

### Option A: hold the bastion connection open, resume it from a second command

Have `open_bastion` return early with a pending id the moment it would have
called `ask()`, keeping the half-authenticated bastion `Connection` alive in
a new registry keyed by that id. A second command, called once the wizard's
own form is answered, resumes from there: authenticates the held connection,
crosses to the target, finishes exactly what `connect_session` would have.

Mirrors how a host key decision already pauses and resumes via `continuing`,
which is a point in its favour. The cost is a connection with a lifetime of
its own outside the call that opened it, exactly the class section 6 asks
for a teardown path on, and this one needs a timeout as well as a teardown:
a wizard test abandoned between the prompt and an answer would otherwise hold
a slot against the bastion's `MaxSessions` indefinitely, worse than the
`ask()` case where the window's own close already answers the request today.

### Option B: answer the same way, skip the window

`CredentialRequests` is already whatever's on the other end of `ask()`: an
opaque request id, a prompt readable by that id, an answer sent down a
channel. None of that is window-specific; only `open_window` is. So `ask()`
gains a sibling, `ask_inline`, that opens the request exactly the same way
and, instead of opening a window, emits an event carrying the request id.
`connect_session`'s own call stays exactly where it already was: awaiting the
answer, inside `open_bastion`, exactly as `ask()` leaves it. Nothing about
the pause-and-resume shape changes, only who is expected to answer.

The wizard listens for that event while its own `connectSession` call is in
flight, reads the prompt by id (`credential_prompt`, unchanged: it never
cared who was asking), and answers through `submit_credential`, unchanged
too, since answering was never window-specific either. No new registry, no
new lifetime, no new teardown: the connection's lifetime is exactly what it
already was, held on the stack inside the one call that owns it, for exactly
as long as that call is still running.

## Decision

Option B.

The reason is that Option A's cost, a connection with a lifetime issued by
one call and resumed by another, is a real complication of a shape this
codebase has been careful to avoid (registry.rs's whole `has_shell` guard
exists because of exactly this class of thing). Option B needs none of it,
because the pause was never the problem: `ask()` already pauses
`connect_session` correctly, mid-call, for as long as a window takes to be
answered. The only thing that needed to change is where the answer comes
from, and `CredentialRequests` already speaks to that without knowing.

`connect_session` gains one parameter, `inline: bool`, threaded through
`Chain` to the one branch of `open_bastion` that decides between `ask` and
`ask_inline`. The target's own credential is unaffected: ADR-0032 already
moved it, and this document does not touch that path.

The bastion's form is not locked to the method the wizard's step 2 chose,
unlike the target's. Step 2 answers a question about the target; the
bastion is a different host, and nothing has asked about it yet. Its inline
form offers the same choice the separate window always did, defaulting to
password, and carries the same explanation the window's banner already gives,
"this credential is for the jump host, not the one you asked for", reused
rather than rewritten, because a session behind two hops one day will need
it to still be true.

## Consequences

**Good**: a wizard test now shows one continuous sequence: host key,
bastion credential when there is one, target credential, with nothing
handed off to a window at any point. `connect_session`'s own shape, and
`open_bastion`'s, are unchanged in everything but which function they call to
ask; the pause-and-resume mechanics this decision leans on already existed
and already worked.

**Bad**: `ask_inline` and `ask` now have to be kept answering the same
contract by hand: a change to one that the other should have mirrored is a
class of drift nothing catches automatically, the same risk ADR-0030's Bad
section already named for `attemptSurface`'s two renderers.

**Bad**: the wizard now listens for a global event while `connectSession` is
in flight, filtered by nothing but "an inline request exists right now",
correct only because a wizard test is the one caller that ever passes
`inline: true`, and only one such test can be running at a time (one attempt,
one generation, per `useConnect`). A second inline caller, if one is ever
added, would need the event payload to carry more than a bare id to stay
addressed to the right listener.

**Follow-up**: none named beyond what ADR-0032 already left: this closes the
gap that document's own follow-up section predicted rather than opening a new
one.

**Amended by ADR-0039 (2026-08-30).** `ask` loses its only caller: a chain
opened from Sessions (`chain.inline: false`) no longer collects the bastion's
credential itself, it lets the failure propagate and sends the user to the
bastion's own wizard entry instead. `ask_inline` and everything else this
document built is unchanged; only the `else` branch that used to call `ask`
is gone.
