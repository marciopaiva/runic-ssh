# ADR-0035: An opt-in internal vault behind a master password

* **Status**: Accepted
* **Date**: 2026-08-29

## Context

ADR-0034 made the wizard always write a proven credential to the system
keychain, with no choice offered, and `ForThisRun` (`SessionSecrets`,
in-memory only) as the one fallback when `Vault::availability()` reports
`Unavailable`. That fallback is honest about what it is: a credential kept
for the life of the process, gone the moment it ends. On a machine with no
secret service, a real one, a container, a minimal Linux install, WSL,
closing Runic SSH and reopening it means typing every password again.

The maintainer asked whether an internal, self-managed vault could remove
the dependency on the OS keychain. The first shape considered, an encrypted
file whose key the application derives on its own, with nothing the user
supplies, was checked against `docs/security-model.md` rather than assumed
either way. Its own "Adversaries we design against" section lists, as
in scope: *"Another local process without root. Reads our config files, our
logs, our temporary files, and our memory if we make it easy."* A key
derivable by the application alone is derivable by anything else running as
the same user, which is exactly that adversary. Such a vault would not be a
weaker keychain; it would be obfuscation presented with the same "In the
system keychain, until I remove it" copy ADR-0034 already had reviewed for
the real thing, which is a claim it would not be entitled to make. That
ruled the keyless shape out before any option below was weighed.

A master password fixes the protection question, at the cost of a UX
question ADR-0034 spent this whole working session removing: something has
to be typed before a credential is usable again. Two shapes were weighed for
who pays that cost, and the maintainer, asked directly, chose the one that
does not charge it to everyone.

## Options considered

### Option A: replace the system keychain outright, for every installation

The internal vault becomes the only mechanism, on every platform, whether or
not a system keychain exists. `keyring` leaves `Cargo.toml`. Every user
unlocks a master password on every launch that touches a stored credential,
including the near-totality who have a working keychain today and currently
unlock nothing.

Removes the platform-dependent behaviour (`Availability`, three different
backends) entirely, at the cost of that unlock on every session, for
everyone, to solve a gap that only exists on a fraction of the installed
base. A forgotten master password has no recovery by construction; that
risk would also apply to every user rather than the ones who chose to accept
it.

### Option B: an opt-in backend, off by default

A setting, off by default: *"Use an internal, password-protected vault
instead of the system keychain."* Off, nothing changes from ADR-0034.
Switched on, a master password is created once, and from then on this
installation's stored credentials live in an encrypted file instead of the
OS keychain. Suggested, not forced, the moment `credentialStoreStatus`
reports `Unavailable`, since that is exactly the installation with a real
gap to close, and left alone everywhere else.

Two backends now exist behind `Vault`, permanently, rather than one. That is
a real, ongoing cost the codebase carries forward. What it buys is that the
unlock cost lands only on installations that chose it, and ADR-0034's
"nothing asked again" holds exactly as built for everyone who did not.

## Decision

Option B.

**The internal vault stays locked until something actually needs it,
not on launch.** A session on this installation can list hosts, edit one,
connect to a host whose credential is `ForThisRun` or freshly typed, all
without a prompt. The master-password prompt appears the first time, in
that session, a `store` or a `resolve` reaches a credential this backend is
responsible for. The derived key then lives in memory (`zeroize`d on drop,
the same rule `SessionSecrets` already follows) for the rest of that
session, so nothing after the first prompt asks again. This is narrower
than what Option B's own name suggests at first read, and is deliberately
so: "opt-in" should mean the cost lands on people who chose it, not on
every launch of an installation that merely has the setting available.

**Switching the setting on migrates what is already stored.** Every
credential this installation currently has in the OS keychain is read
(`keyring` is not removed; it is what migration reads from) and re-written
into the new encrypted file, under the master password just created.
Nothing is deleted from the OS keychain by this step; an entry nothing
reads any more is inert, and leaving it is simpler and safer than adding a
delete path whose own failure would need handling. Switching back to the
system keychain later is the mirror of this, unlocking the internal vault
first: real to build, and specified no further than that here, because
nothing about it is architectural once the direction above works.

**Encryption**: Argon2id derives a key from the master password and a
stored salt (the salt is not secret; it lives beside the ciphertext). The
derived key encrypts each credential with an AEAD cipher, ChaCha20-Poly1305,
keeping the same per-entry shape `StoredCredential`/`Wire` already establish
for the keychain path, so decoding on the way back out is unchanged code.
Both are new dependencies from the RustCrypto family `zeroize` already
belongs to, not a new family the tree has to start trusting.

**A forgotten master password has one answer: reset.** There is no recovery
by construction, the same as any password-derived key. Resetting wipes the
encrypted file and returns the setting to off; every credential that lived
only there has to be typed again. This is named on the toggle itself before
it is ever turned on, not discovered later.

`Availability` is unchanged: it still answers "does the OS keychain exist,"
which is what suggests the setting in the first place. A new, separate
piece of state answers "is the internal vault set up, and is it unlocked
right now," because those are different questions and conflating them was
what made the earlier full-replacement sketch harder to reason about than
it needed to be.

## Consequences

**Good**: the gap that opened this document, a keychain-less machine
losing every credential on restart, closes for whoever chooses to close
it, without moving the cost onto installations that already work. The
protection is real: `docs/security-model.md`'s adversary 3 is defended
against exactly as well as the OS keychain path already defends against it,
because both now require something the local machine alone cannot produce.

**Bad**: `Vault` (or its caller) now branches on which backend an
installation uses, permanently. A change to how a credential is stored has
two places to make it correctly instead of one, the same class of drift
ADR-0033's own Bad section named for `ask`/`ask_inline`.

**Bad**: two new dependencies (an Argon2id crate, a ChaCha20-Poly1305
crate), both new families' worth of trust the tree did not carry before,
even though both are widely used, audited RustCrypto crates.

**Bad**: migration reads every existing credential out of the OS keychain
in the clear, in memory, at the moment the setting is switched on. That
moment is a larger-than-usual exposure window by construction, unavoidable
since the whole point is moving the material somewhere else; it is named
here so a future reader does not find it and wonder whether it was noticed.

**Follow-up**: the reverse migration (internal vault back to system
keychain) is authorized by this decision but not specified past "unlock
first, then mirror the forward path." Specify it before shipping the
toggle, not after. Decide where the toggle and the master-password prompts
live in Settings; this document authorizes the mechanism, not the screen.

**Corrected 2026-08-29**: "unlock first" above was implemented as asking for
the master password again on every disable, even in a session that had
already unlocked the vault. That put two password fields on the Settings
card at once while locked, one to unlock and one to disable, and asked
nothing real: a session that has unlocked the vault already resolves any
saved credential from it without a further prompt, so a second prompt only
for disabling protected nothing that being unlocked did not already give
away. `disable` now uses the key the session already holds and refuses with
`vaultLocked` if called without one; the master password is asked for only
by `enable` and `unlock`, never a second time in the same session.
