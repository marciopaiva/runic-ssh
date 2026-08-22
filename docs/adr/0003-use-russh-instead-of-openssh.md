# ADR-0003: Speak SSH with `russh` instead of driving the OpenSSH binary

* **Status**: Accepted
* **Date**: 2026-08-21

## Context

The client needs interactive shells, SFTP, and port forwarding on Windows,
macOS, and Linux. There are two ways to get them: implement the protocol in
process, or drive an external `ssh` binary and parse what comes back.

Windows is the constraint that decides this. Its bundled OpenSSH is optional,
version-variable, and not guaranteed present. Interactive password and
passphrase prompts on a spawned `ssh` process are also awkward to intercept
without a pty, and doing so means credentials transit a subprocess boundary.

## Options considered

### Option A: Spawn the OpenSSH binary

Battle-tested protocol implementation maintained by people who do only this. We
inherit their correctness and their security response for free, and users get
their existing `~/.ssh/config` behavior exactly.

But we would parse a human-facing interface designed for terminals rather than
programs. Prompts, warnings, and error text change between versions and locales.
Credentials would move through process arguments, environment, or a pty, none of
which we fully control. Windows availability is not guaranteed. Port forwarding
and SFTP would mean managing several child processes and reconciling their
lifetimes with the UI.

### Option B: `russh` and `russh-sftp` in process

A pure Rust implementation. No external dependency, identical behavior on all
three platforms, structured errors instead of scraped text, and credentials that
never leave our address space. Channels multiplex over one transport, which is
what SSH is designed for, so shells, SFTP, and tunnels share a connection
naturally.

The cost is ownership. We take on protocol correctness and the security response
for the SSH layer, and `russh` has a far smaller review surface than OpenSSH.

### Option C: `libssh2` through bindings

A mature C library with Rust bindings. Inherits C memory safety risk and pulls
an FFI build dependency into every platform's build, against a project that
otherwise builds with `cargo` alone.

## Decision

Option B, `russh` and `russh-sftp`.

Two factors decide it. Credentials stay in our address space, which is what
makes the guarantees in `security-model.md` enforceable rather than aspirational.
And behavior is identical across platforms, so Windows is a first-class target
rather than the one where features quietly differ.

The tradeoff accepted is a smaller, less scrutinized protocol implementation
than OpenSSH, and responsibility for tracking its advisories ourselves.

## Consequences

**Good**: no external binary and no version detection. Structured errors instead
of parsed English. Credentials never cross a process boundary. Channels
multiplex over one connection, so shell, SFTP, and tunnels come from one
transport. Windows behaves like the others.

**Bad**: we own SSH protocol correctness, including key exchange and cipher
negotiation, and we must track `russh` advisories actively rather than relying
on the OS to patch. `~/.ssh/config` compatibility becomes our implementation
work, and users will expect it. Algorithm support is whatever `russh` supports,
so an old host using a legacy cipher may fail where the system `ssh` succeeds.

**Follow-up**: add `cargo audit` to CI before v0.1.0 and treat a `russh`
advisory as release-blocking. Decide the scope of `~/.ssh/config` support in its
own ADR when session import is designed for v0.2.0. Revisit this decision if
`russh` becomes unmaintained.
