# ADR-0027: Let a bastion ask for its own credential

* **Status**: Accepted
* **Date**: 2026-08-26

Amends ADR-0023 and ADR-0008. The structure of the chain is untouched; what
changes is where the bastion's credential may come from, and how many a single
connection may collect.

## Context

ADR-0023 decided that a bastion authenticates from the OS keychain and never
from a window. The reason was concrete: a bastion is crossed dozens of times a
day on the way to many hosts, and a password window for it on the way to each
target is what makes somebody stop using the feature. A bastion with nothing
saved is refused, with an error naming the one-time fix, which is to connect to
it directly once and choose to remember.

That ADR also said, in the same breath, that Option B was where this ends up. It
sequenced A first so the chain would exist before ADR-0008's credential model
was amended for a screen that could not be tested until it did. It named two
conditions for revisiting: somebody having a bastion they cannot save a
credential for, or a machine that cannot save one at all.

**The second condition turned out to be already true when that was written.**
`Vault::availability` models a machine with no secret service, and the rest of
the application degrades there by collecting a credential per connection, which
works and is documented. The chain is the one feature that hard-requires a
keychain, so on a machine without a secret service the bastion's credential can
come from nowhere. This is #165, found by running the feature rather than by
reasoning about it, and reproducible on WSL with no libsecret provider running.

Four things constrain the answer.

**The wall is narrower than #165 describes, and reading the code is what shows
it.** `open_through` asks `Registry::shared_of_session` before resolving
anything, and that map is the ordinary open-session map. A bastion already open
in a tab is ridden rather than opened again, and no credential is resolved at
all. So a machine with no keychain can reach a host behind a bastion today, by
opening the bastion first. The wall is a bastion nobody has opened, met by
somebody who does not know that trick, which is everybody meeting the feature
for the first time.

**One prompt per run is already expressible.** ADR-0025 gave the credential
three keep modes, and the middle one lives in `SessionSecrets` for the life of
the process. `resolve_credential` reads that store before the vault. So an
answer kept for the run satisfies every later chain through the same bastion,
on a machine with no keychain, without anything reaching a disk.

**Half of ADR-0023's precondition is already met.** It refused Option B until
the host key and credential screens could say which hop is asking, because two
identical windows in sequence for two different hosts is worse than one refusal
with an explanation. The host key screen has said which hop since #133
(`hostKey.hop.bastion`). The credential window has not.

**The ordering ADR-0008 depends on survives.** That decision collects the
credential only after the host key has been verified, so no password is ever
typed at a host nobody has checked. In `open_bastion` the bastion's key is
verified by `connect_reporting` before anything else happens, so a prompt there
is still after verification, at the same point in the sequence as the target's.

There is also a question that keeps being asked and is worth recording as
answered rather than re-litigated: whether the prompt could be a dialog inside
the main window instead of a window of its own. That is ADR-0008's Option A. It
was considered and rejected there, on the grounds that the main document renders
bytes a hostile host chose and JavaScript cannot erase a string, so the only
thing resembling zeroization available to a webview is destroying the whole
document. Nothing in this decision changes that. What the prompt looks like is
open; which document it lives in is not.

## Options considered

### Option A: the core prompts, inside `open_bastion`

When the vault has nothing for the bastion, the core opens the credential window
itself and waits for the answer, then authenticates with it. The machinery is
already core-side: `CredentialRequests::open` issues a request and
`open_window` builds the window, and `authenticate_interactively` is a thin
command wrapping the two. So this needs no new IPC command and no new
dependency. `CredentialPrompt` gains a field naming the hop, which is additive
on the wire.

It costs an amendment to ADR-0008, from one credential per connection to one per
hop, and it puts a wait on a person inside a command that previously waited only
on the network.

### Option B: the core refuses and the frontend prompts

`open_bastion` returns a typed error carrying the bastion's id. The frontend
calls a new command to authenticate that bastion, then retries the connect.
Cheap in Rust, and every screen it needs already exists.

What it costs is where the ordering lives. "Verify, authenticate, forward,
verify, authenticate" is the whole security content of the chain, and this moves
its retry logic to the side that renders hostile output. ADR-0023 rejected its
Option C for exactly this and the argument has not changed.

### Option C: give the bastion a real handle

Connect the bastion as an ordinary session under the hood, so
`authenticate_interactively` works on it unchanged and nothing new is written.
Also rejected by ADR-0023, for a reason that still holds: it produces two
handles for one thing the user thinks of as one session, so the bastion is
either a tab nobody asked for or a connection nothing can close.

### Option D: keep ADR-0023 and fix only the message

Check `Vault::availability` before opening the bastion at all, and fail naming
the keychain rather than a credential that was never there. The string for it
already exists and already says the right thing; the error mapping picks the
keychain failure instead, which is why the panel today blames a credential that
could not be read.

Honest, an afternoon's work, and it leaves the feature unusable on those
machines. Worth doing if this decision waits; wasted if it does not, because
with a prompt there is no failure left to explain.

## Decision

Option A.

It beat Option B and Option C on the same ground ADR-0023 chose Option A over
its own Option C: the ordering is the security content, and it belongs in the
core. It beat Option D because Option D is a better error message in front of a
feature that still does not work.

**The tradeoff accepted is that a connection can now open two credential windows
in sequence, and the only thing distinguishing them is a line of copy.** That is
precisely the risk ADR-0023 named when it refused to do this first, and the
answer to it is a line in the window naming the hop, which is copy rather than
structure. Copy is the weakest kind of guard this repository has.

Three details are decided with it.

**The fallback is narrow.** The prompt opens when the vault holds no entry for
the bastion, or when the machine has no credential store at all. Every other
failure keeps refusing, with the message it has now. A locked keyring is a
different thing from an absent one, and falling back on both would teach people
to retype a password every time the keyring is locked, which is how a keyring
stops being worth having.

**The prompt offers the same three keep modes, and does not invent a fourth.**
`can_remember` already reports whether the keychain is there, so on a machine
without one the third mode is not offered, exactly as it is not offered
elsewhere. Keeping for the run is what makes this one prompt per run instead of
one per target, and that is worth saying in the window rather than hiding in a
default.

**The window says which hop is asking.** Not decoration: it is the whole of what
ADR-0023 required before this could be done at all.

### The rebuild, which this decision did not survive contact with

The first version of this decision stopped at the three details above and was
driven against the fixtures. It failed on its first contact with a person, in
the way the Bad section below now records as item 1, and the correction belongs
in the decision rather than in a follow-up.

Accepting the far host's key rebuilds the entire chain. ADR-0023 chose that on
purpose, because the transport has no "accept for this session" path, and wrote
it down as a consequence. It cost nothing while the bastion authenticated from
the keychain in silence. Once the bastion can ask, the rebuild asks **a second
time, for the same host**, and it arrives in the position where the user has
just learned to expect the far host's prompt. Somebody typed the far host's
password into that window on their first attempt.

So a credential typed for a bastion and kept nowhere is **held against the
decision that interrupted it**, and the retry names the decision it is
continuing. The alternative considered was parking it in `SessionSecrets` and
clearing it when the attempt ends, which is fewer moving parts and wrong in one
way that matters: `Keep::Never` would stop meaning what it says, and an attempt
the user walks away from has no end for anything to be cleared at.

Keying it to the decision gives three properties the run store cannot:

* it is taken once, by the one retry it belongs to, so a repeated retry asks
  again rather than reusing a secret nobody re-authorised;
* it never enters the store that survives a connection, so the three keep
  answers keep meaning what they say;
* a decision nobody answers can be dropped, and dropping it takes the secret.

That last one is why this decision also adds `dismiss_host_key`. Cancelling a
host key prompt used to reach the core not at all: the interface dropped the
attempt and the entry sat in `PendingHostKeys` until the process ended. One host
name and one key left behind is untidy. A credential left behind is not, and a
secret the user asked us not to keep must not outlive the attempt they abandoned.
The way out has to be told as well as the way through.

## Consequences

**Good**: a machine with no keychain can use a jump host, which removes the
asymmetry #165 named. The wall in front of a first-time user goes, and ADR-0023
accepted that wall explicitly as a cost rather than a feature. Kept for the run,
one prompt serves every host behind that bastion for the life of the process,
which is what ADR-0023 was protecting when it refused a window per target. No
new command, no new dependency, no migration.

**Bad**:

1. **ADR-0008 is amended from one credential per connection to one per hop.**
   The window can now open twice for a single click, for two different hosts,
   and what separates them is a sentence. If that sentence is wrong or gets
   translated badly, the failure mode is somebody typing the target's password
   into the bastion's prompt.

   This is not a hypothetical and it should not be read as one. The first
   version of this decision let the rebuild ask for the bastion a second time,
   and the person driving it typed the far host's password into that window
   while the heading above the field said it was the jump host's. The copy is
   the weakest guard in this repository and it lost the first time it was
   tested. What fixed it was removing the second prompt, not improving the
   sentence.
2. **The bastion now sits unauthenticated while a person types.** `sshd` closes
   an unauthenticated connection after `LoginGraceTime`, two minutes by default.
   Until now the bastion authenticated immediately from the keychain and the
   grace period was never in play. It is now, and the failure it produces reads
   as the SSH conversation not finishing rather than as a timeout on a prompt.
   Measured on this repository's own fixtures on 2026-08-26, while driving a
   host key prompt slowly.
3. **A connect the user started by clicking host B can now ask about host A.**
   That is the point, and it is also a thing nobody has seen this application do
   before.
4. `connect_session` waits on a person where it used to wait only on the
   network. ADR-0016's twenty-second deadline covers the connect and the
   handshake only, so a slow typist does not trip it, but the command's
   worst-case duration is now unbounded by design.
5. Dismissing the bastion's prompt has to close the bastion connection. A
   refusal that leaves it open holds a slot against the server's `MaxSessions`
   until the application restarts, which is the failure `open_bastion` already
   guards for every other path.
6. The narrow fallback means a locked keyring still refuses. That is the right
   behaviour and it is invisible: two machines fail differently for reasons the
   user cannot see unless the message says so.
7. **A credential now exists in a third place**, briefly: not the keychain, not
   the run store, but a map keyed by a host key decision. It is encoded the way
   the vault holds one, it is taken once, and it is dropped when the decision is
   answered or abandoned. It is still a third place, and the count of places a
   secret can be is the number this project is trying to keep small.
8. **A bastion cannot report a keep that was refused.** #167 gave the host the
   user clicked a way to say that the keychain would not hold its credential,
   because a tick box that does nothing and says nothing is worse than one that
   is not offered. The bastion now offers the same tick box through the same
   window and has no channel to report the same refusal, so the answer is
   carried forward for this attempt and the user finds out on the next run by
   being asked again.
9. `connect_session` takes a parameter naming a decision, so the interface can
   now describe a relationship between two attempts. Nothing stops it passing an
   id from an unrelated attempt; the worst that does is spend a credential on
   the wrong retry, which fails to authenticate and prompts again.

**Follow-up**: what the credential window looks like is now worth deciding, since
it is going to be seen more often; it is a separate decision and does not touch
which document it lives in. Saving a jump host's credential at the moment it is
registered is the other half of what this makes convenient, and wants the real
sequence rather than a password field on a form. ADR-0024 already reduces how
often this prompt fires, because a shared bastion is authenticated once. Revisit
this if keyboard-interactive authentication lands, which ADR-0008 put out of
scope and which is the same problem with worse properties.
