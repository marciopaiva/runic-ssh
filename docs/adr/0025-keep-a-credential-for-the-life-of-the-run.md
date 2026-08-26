# ADR-0025: Keep a credential for the life of the run

* **Status**: Accepted
* **Date**: 2026-08-25

Amends ADR-0004. Where a credential may live gains one place; what may reach it
does not change.

## Context

ADR-0004 put credentials in the OS keychain, referenced by an opaque id, and
gave the application exactly two states: a secret is kept there, or it is asked
for again on every connection. `Vault::availability` already reports a machine
with no secret service, and the interface already degrades to asking each time,
which works.

Three things say that is not enough.

**A machine with no secret service is not exotic.** This repository's own
development machine is one: `libsecret` is installed, no daemon provides
`org.freedesktop.secrets`, and `availability` answers `Unavailable`. On such a
machine nothing can be kept at all, for any host.

**Jump hosts made it worse than an inconvenience.** ADR-0023 resolves a
bastion's credential from the keychain and nowhere else, deliberately, because a
window per target would make the feature unusable. On a machine with no
keychain that means no jump host works at all, which is #165. ADR-0024 narrowed
it by letting a chain ride a bastion the user opened themselves; it did not
close it.

**The two states are further apart than the question people actually ask.**
"Keep this until I say otherwise" and "ask me every single time" leave out the
one in the middle, which is what somebody sitting down to work for an afternoon
wants: type it once, stop being asked, and have it gone when the application is.

The threat model has a bearing on how much this may cost.
`docs/security-model.md` does not defend against a local attacker already
running as the user. A secret held in this process for the life of the run is
therefore not exposed to anything the model claims to stop, provided it is never
written anywhere.

## Options considered

### Option A: keep it in memory for the life of the process

A third answer in the credential prompt: keep it until the application closes.
The secret stays in the core, in a map keyed by the same opaque id the keychain
uses, wiped on drop, and **never written to disk under any circumstances**.

It costs no dependency and no cryptography. It does not survive a restart, and
the control says so rather than leaving somebody to find out.

### Option B: an encrypted vault file with a master passphrase

`argon2` and `aes-gcm` are already compiled into this tree through `ssh-key`,
`pkcs5` and `ssh-cipher`, so promoting one to a direct dependency does not grow
the audit surface the way a new crate would.

Against the threat model above it is not obviously weaker than a keychain: the
keychain's real advantage is that the operating system manages the unlock rather
than us. What it costs is that we become responsible for key derivation
parameters, nonce handling and re-encryption on every write, which is where this
kind of thing is got wrong. It also means depending directly on `argon2` at
`0.6.0-rc.8`, which is a release candidate.

### Option C: leave it, and lean on the agent

`russh` ships an ssh-agent client, and `authenticate_publickey_with` takes a
signer. For key authentication that removes the storage question rather than
answering it, and it is worth doing on its own account.

It answers nothing for password authentication, which is what the container
fixtures use and what a great many hosts still use.

## Decision

Option A.

It beat Option B on proportion. An encrypted vault is a real feature with a real
threat model to write down, and building one to relieve an inconvenience is how
a project ends up owning cryptography it did not need. Option B stays available
and is not foreclosed: a third place to keep a secret slots in beside the two
this decision leaves.

It beat Option C on coverage rather than on merit. The agent is the better
answer where it applies and should still be built; it does not apply to a
password.

**The tradeoff accepted is that the middle state is the one most likely to be
misread.** Somebody who chooses it and then restarts the application will be
asked again, and will not necessarily connect that to a choice they made an
hour earlier. The control has to say what it means at the moment of choosing,
because there is no second chance to explain.

Nothing about who may reach a credential changes. The frontend still names one
by opaque id and never holds one, which is rule 1 and the reason ADR-0004 exists.

## Consequences

**Good**: A machine with no secret service can keep a credential for as long as
somebody is working, which is most of what keeping one is for. #165 stops being
a wall for the case people meet. The frontend stops deciding whether a stored
credential exists, which it was doing from a field in the session file that
could be stale; it asks the core and falls through when the answer is no.

**Bad**: There are now two places a credential can be, so every question about
one has to ask twice, and a resolution path that consults two stores in order is
a path that can consult them in the wrong order. A secret that outlives the
authentication that used it is a secret held longer than the strictest reading
of rule 4 would like, and the defence is only that it is never written and is
wiped on drop. The middle state is easy to misread, as above.

**Follow-up**: Option C, the agent, which is orthogonal and still worth having.
Option B if a reason turns up that is stronger than convenience. #131, which
this makes more urgent rather than less: a second holder of secret material is a
second thing that must not render itself, and the guarantee is still a
hand-written `Debug` plus everyone remembering.
