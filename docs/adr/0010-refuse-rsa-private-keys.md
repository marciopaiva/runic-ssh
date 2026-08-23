# ADR-0010: Verify RSA host keys, refuse RSA private keys

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

Adding `russh` brought `rsa 0.10.0-rc.18` into the tree, and with it
**RUSTSEC-2023-0071**, the Marvin Attack: a timing side channel in RSA private
key operations through which a key can, under the right conditions, be
recovered. The advisory carries a medium severity and, importantly, says *no
fixed upgrade is available*.

ADR-0003 chose `russh` over the OpenSSH binary and accepted the consequence in
writing: "we must track `russh` advisories actively rather than relying on the
OS to patch", and "treat a `russh` advisory as release-blocking". This is the
first real test of that sentence, and the audit added in #9 caught it on the
same day the dependency landed, which is the control working as designed.

What matters for the decision is which operations the attack reaches. Marvin is
a timing attack on the holder of a **private** key:

* **Verifying a server's RSA host key** is a public-key verification. The
  attacker would be attacking their own key. Not reachable.
* **Authenticating with the user's RSA private key** is a signature. Reachable
  in principle: a hostile server can induce repeated attempts and time them.

`russh` makes RSA an optional feature, so all three positions are available.

## Options considered

### Option A: Disable the `rsa` feature entirely

The crate leaves the tree, `cargo audit` is clean with no exceptions at all, and
the security posture needs no explanation.

It also means refusing to connect to any server whose host key is RSA. That is
still common on machines nobody has updated, which is precisely the population
this product's audience administers. "Does not connect" is a worse answer than
"connects, with a documented limitation", and a tool that cannot reach the old
servers loses the users it was built for.

### Option B: Keep RSA and record that the risk is accepted

Everything works, and an `audit.toml` entry says we tolerate the advisory. This
is what most projects do.

It also makes ADR-0003's release-blocking sentence decorative on its first
outing. If the answer to the first genuine advisory is to ignore it, the honest
move would be to rewrite that ADR rather than leave it claiming something the
project does not do.

### Option C: Keep RSA for host keys, refuse RSA private keys

Host key verification continues to work, so old servers stay reachable. Private
key authentication with an RSA key is refused at our layer, with an error that
says why, so the exposed operation is never performed.

The cost is real and lands on users: someone whose only key is `~/.ssh/id_rsa`
cannot authenticate with it and must generate an Ed25519 or ECDSA key. For a
client aimed at people who administer machines, that is an inconvenience rather
than a blocker, but it is an inconvenience we are imposing rather than one they
chose.

## Decision

Option C, accepted on 2026-08-22.

`russh` keeps its default features. `ssh::connection` refuses a private key
whose algorithm is RSA, before any signing happens. The advisory is listed in
`src-tauri/.cargo/audit.toml` with this reasoning attached, not as "risk
accepted", but as "the reachable path is removed".

The tradeoff accepted is that the vulnerable code remains linked into the
binary. Nothing but our own refusal keeps it unreached, and a future change that
adds an RSA signing path would reintroduce the exposure silently. That is why
the refusal has a test.

## Consequences

**Good**: servers with RSA host keys stay reachable, which keeps the product
useful to the people it targets. The vulnerable operation is never executed. The
audit stays green without pretending the advisory does not exist, and the
`audit.toml` entry states a technical reason a reviewer can check rather than a
risk acceptance nobody can argue with.

**Bad**: users with only an RSA key are turned away, and they will experience
that as the client being broken rather than careful. The error has to say what
to do about it, in their language, or this decision reads as a bug.

**Bad**: the vulnerable crate is still linked. This is a policy enforced by our
code, not a property of the dependency graph, and policies decay. The test is
the only thing standing between a future refactor and a quiet regression.

**Bad**: `ssh-rsa` host keys are also weak for other reasons, and continuing to
accept them is a separate question this ADR does not answer.

**Follow-up**: revisit when the `rsa` crate ships a fix, at which point both
the refusal and the `audit.toml` entry come out together, and neither should be
removed without the other. Until then, treat the entry as expiring: if it is
still there when RSA support is next discussed, that is a signal, not a
formality.
