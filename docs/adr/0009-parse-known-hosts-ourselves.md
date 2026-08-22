# ADR-0009: Parse `known_hosts` ourselves, over minimal primitives

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

The client has to read and write OpenSSH's `known_hosts`, both because rule 3 of
`docs/security-model.md` rests on it and because
`docs/architecture.md` chose that format deliberately: the user can inspect it
with tools they already trust, and import from a setup they already have.

Reading it needs three primitives that nothing in the tree provides yet:

* SHA-256, to show a fingerprint the user can compare against another source;
* HMAC-SHA-1, because a hashed entry is `|1|salt|hash` where the hash is
  `HMAC-SHA1(key = salt, message = hostname)` — there is no way to match a
  hashed host without computing it;
* base64 decoding, because the key blob is stored encoded.

Hand-writing SHA-1 or SHA-256 is not a serious option in a project whose threat
model names a supply chain attacker: the risk of a subtle bug in our own
implementation is worse than the risk of depending on the ones everyone uses.

Section 5 of `CLAUDE.md` requires a proposal before a runtime dependency, which
is what this record is. One fact reduces the stakes considerably: **`russh`
0.63, which ADR-0003 already committed us to, depends on `sha2 0.11`,
`sha1 0.11`, `hmac 0.13`, `ssh-key`, `ssh-encoding` and `zeroize` directly.**
Every primitive named above arrives in the dependency graph the moment the SSH
layer lands. Declaring direct use of them now does not enlarge the final graph;
it only brings the declaration forward.

## Options considered

### Option A: Minimal primitives, key blob treated as opaque bytes

Take `sha2`, `sha1`, `hmac` and `base64ct`, and write the `known_hosts` parser
and writer ourselves. The key itself is never interpreted: an entry holds a type
string and the decoded blob, and trust is decided by comparing those bytes.

This is what OpenSSH does. Trust in `known_hosts` is not a statement about a
key's internal structure; it is a statement that the bytes are the same bytes as
last time. Interpreting the key to decide that adds a way to be wrong without
adding a way to be right.

The cost is that the format is ours to get right, and it has genuine traps:
hashed hostnames, `[host]:port` for a non-standard port, `@revoked` and
`@cert-authority` markers, comma-separated host lists, negations, wildcards,
several key types for one host, and lines written by other tools that we must
not corrupt when rewriting the file.

### Option B: `ssh-key`

Parses and validates the key properly, rejects a malformed blob at parse time,
and produces canonical fingerprints.

`russh` pins `ssh-key = 0.7.0-rc.11` exactly, while the latest stable release is
0.6.7. Depending on 0.6 would put two incompatible copies of `ssh-key` in the
tree; matching the pin means depending on a release candidate and following
`russh`'s version choices from now on. It buys validation we do not need for a
byte comparison.

### Option C: Add `russh` now and use its `known_hosts` helpers

One dependency, already authorised, with the work done.

It also hands the host key decision to the library. Rule 3 requires three
explicit outcomes — unknown prompts, matched proceeds, changed *blocks* — and
ADR-0003 accepted that the SSH layer's security response is ours. Delegating the
trust decision is the one part of that we should not delegate. It would also
pull the whole SSH stack in before anything connects.

## Decision

Option A, accepted on 2026-08-22.

`sha2`, `sha1`, `hmac` and `base64ct` become direct dependencies. The
`known_hosts` parser and writer are ours, and a key is an opaque blob compared
byte for byte.

The tradeoff accepted is that the format's traps are ours to handle, and that a
parsing bug in a security control is a security bug. That is answered with
tests rather than with a library, because the alternative libraries do not
remove the parsing — they only move where it happens.

## Consequences

**Good**: no new crate in the final dependency graph. No release candidate. The
three-outcome trust decision stays in our code, where rule 3 can be read
alongside it. A malformed line written by another tool is ours to tolerate
rather than something that makes a library refuse the whole file — which
matters, because refusing to read `known_hosts` means refusing to detect a
changed key.

**Bad**: four more crates to track for advisories, ahead of when `russh` would
have brought them. `cargo audit` already covers that, and this is exactly the
release-blocking case ADR-0003 described.

**Bad**: we own the format. Every trap listed above is a way to be subtly wrong
in a control the user cannot see working. A wrong answer here does not look like
a bug — it looks like a connection that succeeded.

**Bad**: treating the blob as opaque means we cannot tell a user *why* a key is
unusable, only that it does not match. That is the right trade for trust, and
the wrong one for diagnostics; revisit if users cannot understand what went
wrong.

**Follow-up**: `@cert-authority` entries are recognised and preserved on rewrite
but not honoured — certificate-based host authentication is its own decision and
its own work. A file containing one must not be silently downgraded to
"unknown host", so that case needs an explicit outcome rather than a default.
