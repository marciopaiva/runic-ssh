# ADR-0026: One type holds every secret

* **Status**: Accepted
* **Date**: 2026-08-25

Amends ADR-0004. Where a credential lives does not change. What a credential
*is*, as a Rust type, does.

## Context

Security rule 2 says nothing secret is ever logged: not at any level, not in a
panic message, not in an error returned to the frontend. Today that rule is held
by three hand-written `Debug` implementations and by everyone remembering to
write the fourth.

Each of the three was written after somebody noticed, not before. The most
recent was written this week, and the code it replaced had been in `main`:
`StoredCredential` derived `Debug` over a bare `String` and rendered
`Password { secret: "hunter2" }`. Nothing failed, no test covered it, and the
distance between rule 2 and a password in a terminal was one `dbg!`. That is the
evidence for this decision, and it is stronger than any argument: the remembered
guarantee has already failed once in this repository, silently, and was found by
reading rather than by a check.

### What the audit found

Every path that touches secret material, read in full for the six ways a value
reaches a formatter: `Debug`, `Display`, `Serialize`, a `thiserror` derive
interpolating a field, a `format!`, and a panic payload.

**The three redactions that exist.** `vault::StoredCredential`,
`ssh::connection::Credential` and `ssh::credentials::Answer` each implement
`Debug` by hand. All three are correct today.

**`Zeroizing<String>` renders its contents.** It is a memory guarantee and not
a formatting one, and the two get confused because the name sounds like a
promise. Its `Debug` prints `Zeroizing("hunter2")`, verbatim, which was checked
rather than assumed. It has no `Display` of its own, so `format!("{secret}")`
does not compile; it derefs to `String`, so `format!("{}", *secret)` and
`secret.as_str()` both print the material, and both are what somebody writes
when the first form is refused. Every secret in the tree is passed
around as one, including through `Vault::resolve`, `SessionSecrets` and
`StoredCredential::encode`. Nothing formats one today. Nothing stops the next
person.

**No error interpolates a secret.** Every `#[error(...)]` in the tree is a fixed
phrase. `IpcError` carries no `message`, `reason` or `source` field, and
`tests/secrets_never_escape.rs` already holds that line for every
`ConnectionError` variant by an exhaustive `match` that fails to compile when a
variant is added.

**Nothing logs at all.** There is no `tracing`, no `log`, no `println!` outside
`main.rs`'s startup failure. That is why none of the above has leaked yet, and
it is the least durable fact in this list. The first logging call added to this
codebase turns every `Debug` into a reachable path.

**The one plaintext window.** `submit_credential` takes `password`,
`private_key` and `passphrase` as bare `Option<String>` from the webview and
converts them on the next line. They are the only secrets in the tree that are
not wrapped in anything at all.

**Serialization is the gap the issue named and the one the issue got wrong.**
The proposal in #131 was a wrapper that does not implement `Serialize`, so that
a new field cannot leak by being added to a struct that derives. That is the
right instinct and it does not survive contact: `StoredCredential` has to reach
the keychain as JSON, so something in that path must serialize. What can be
saved is the part that matters, which is that the *public* type refuses.

## Options considered

### Keep the hand-written `Debug`, and add a test for each type

Cheapest, and it is what we have. Each secret-bearing type gets a redacting
`Debug` and an assertion in `tests/secrets_never_escape.rs`.

The objection is that it does not fail when it is broken. A new type, a new
field on an old type, or an added `Display` passes the whole suite. The test
covers the types somebody thought of, and the failure mode is exactly the one
that already happened: a type nobody thought of.

### A source scan that forbids the dangerous derives

A test that reads `src/vault/` and `src/ssh/` and fails on `derive(Debug)` near
a secret. The tree already does this for rule 4, where
`the_ssh_layer_never_reaches_for_the_filesystem` greps for `File::create`.

It works there because the forbidden thing is a literal string that means one
thing. Here it is not: a derive is dangerous because of the type of a field,
which a grep cannot see. It would reject safe code and accept a secret held one
struct further away.

### One type that carries the guarantee

A `Secret` newtype over `Zeroizing<String>` whose trait list is the decision:

| Trait | | Why |
| --- | --- | --- |
| `Debug` | yes, redacted | `<redacted>`, so a derive above it is safe |
| `Display` | **no** | `format!("{secret}")` must not compile |
| `Serialize` | **no** | a struct that derives `Serialize` and gains a secret field must not compile |
| `Deserialize` | yes, transparent | a secret arriving from the prompt is how one legitimately enters |
| `Deref` | **no** | deref to `String` hands back `Display` and every `str` method by accident |
| `expose(&self) -> &str` | the one door | greppable, and the audit becomes `grep -rn expose` |

Then the three hand-written `Debug` implementations are deleted and replaced by
derives, which is the test of whether this worked: the guarantee stops being a
thing somebody wrote and becomes a thing the compiler holds.

`Serialize` is refused on the public type and provided by a private mirror in
`vault/mod.rs` that borrows through `expose()`. There is exactly one place in
the tree where a secret is named to serde, it is four lines long, and it lives
next to the type it serializes.

## Decision

The third. `vault::Secret` exists, holds every secret in the tree, and the
hand-written redactions go.

`Deserialize` is asymmetric with `Serialize` on purpose. They are not opposites
here: deserializing is a secret entering the process from the person who typed
it, and serializing is a secret leaving it. Refusing the second is the whole
point; refusing the first would only mean the plaintext lives as a bare `String`
for a line and a half longer, which is what `submit_credential` does today and
what this closes.

## Consequences

**Good.**

* The rule fails at compile time instead of at review time. A struct that
  derives `Serialize` and gains a secret field does not build.
* The audit is a `grep` for `expose`, and it is short.
* Three redactions that had to be maintained by hand are gone.
* The webview's reply is typed the whole way. No secret in this tree is a bare
  `String` any more.

**Bad, and accepted.**

* `expose()` is a door, and a door can be walked through. `format!("{}",
  s.expose())` compiles and always will. This buys the accident, not the
  deliberate act, which is the trade every type like this makes.
* Two intermediates still exist and are unprotected for their lifetime:
  `serde_json` builds an ordinary `String` when encoding for the keychain, and
  again when decoding from it. Avoiding them means writing a serializer rather
  than using one, which costs more than it protects.
* Refusing `Serialize` on `StoredCredential` means it can never be a field of
  an IPC response type. That is the point, and it is also a wall somebody will
  hit later with a good reason. When they do, the answer is a view type that
  carries what is safe, not a derive on this one.
