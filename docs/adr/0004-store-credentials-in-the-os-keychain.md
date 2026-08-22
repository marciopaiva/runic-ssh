# ADR-0004: Store credentials in the OS keychain, referenced by opaque id

* **Status**: Accepted
* **Date**: 2026-08-21

## Context

The client stores passwords and private key passphrases so users do not retype
them per connection. Whatever holds them has to survive the comparison users
will actually make, which is against PuTTY storing session data in the registry
in the clear.

Two questions are separable and both need answering: where the secret rests, and
what the webview is allowed to see. The webview renders output from hostile
hosts, so the second question is the one that constrains the design.

## Options considered

### Option A: Encrypted file with a master password

Full control over format, identical on every platform, and the user can back it
up. But we own the key derivation and the cipher choice, we have to hold the
derived key in memory for the session, and we add a master password prompt to
every launch. Users who dislike that will disable it, which leaves a weakly
encrypted file.

### Option B: OS keychain via the `keyring` crate

DPAPI on Windows, Keychain on macOS, libsecret on Linux. The secret rests under
a store the OS already unlocked with the user's login, audited far beyond
anything we would write, and inspectable with tools the user already trusts. No
master password prompt.

The cost is three backends with different behavior. libsecret needs a running
secret service, which is not guaranteed on a minimal Linux install or over a
headless SSH session, and the failure needs a real answer rather than a crash.

### Option C: Do not store secrets at all

Prompt every time. Unimpeachable, and unusable for someone opening thirty
sessions a day. They would move to a client that remembers, or paste passwords
from a text file, which is worse than anything we would have built.

## Decision

Option B. Secrets live in the OS keychain. The frontend holds an opaque
credential id and never the value; the core resolves the id against the keychain
at the moment of use and zeroizes the material afterward.

The tradeoff accepted is three platform backends with genuinely different
failure modes, and a Linux path that can fail for environmental reasons we do
not control.

## Consequences

**Good**: no cryptography of our own to get wrong, and no master password
prompt. Secrets rest under a store the OS unlocked and the user can audit. The
opaque id makes the guarantee in `security-model.md` structural: there is no
code path that serializes a secret toward the webview, because the webview never
has anything to ask for.

**Bad**: three backends to test and support, and libsecret is the weak point. On
a machine with no secret service the store is unavailable, and we must degrade
to prompting per connection with a clear explanation rather than failing
opaquely. Keychain entries do not travel with a config backup, so a user copying
their config to a new machine gets their sessions and not their passwords, which
will read as a bug and needs documenting. Session inventory in `config/` stays
unencrypted, so hostnames and usernames are readable by any local process
running as the user: a deliberate scope limit, since we do not defend against a
local attacker running as the user.

**Follow-up**: define and test the Linux no-secret-service fallback before
v0.1.0 ships. Revisit if cloud sync is designed in v1.0.0, since syncing
credentials is a different problem from storing them and needs its own record.
