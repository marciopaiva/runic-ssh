# ADR-0041: Use `russh-sftp` instead of writing the protocol ourselves

* **Status**: Accepted
* **Date**: 2026-08-31

## Context

Issue #127 asks for SFTP: directory listing, download and upload with
progress, and cancelling a transfer in flight. `russh` already gets us a
connection and a channel; SFTP is a subsystem requested on a channel like any
other, the same shape `Connection::open_shell` and `Connection::open_forward`
already use (`channel_open_session`, then a request on the channel, both
taking `&self` rather than `&mut self`). Nothing about opening the channel is
new; what is new is speaking the protocol that runs over it once it is open.

SFTP is a request/response protocol with its own packet framing, several
dozen message types, extensions negotiated at startup, and length-prefixed
names and data that a hostile server controls end to end. `docs/security-model.md`
already names the risk before any code exists: "SFTP filenames are treated as
hostile: no path traversal on download, no control characters rendered raw in
the file list, length capped." Getting the *framing* wrong is a different
failure than getting a *path* wrong, and only one of them is this project's
problem to solve by hand.

`ssh/registry.rs`'s guard against a second shell (`Registry::has_shell`,
#94, ADR-0014) is unrelated to opening an SFTP channel: the guard lives
entirely in `Entry::input`, set only when a shell attaches, and an SFTP
channel is a second, independent channel on the same `Handle` that never
touches it. This ADR does not change that guard; it is recorded here because
#127 named it as a constraint worth confirming rather than assuming.

## Options considered

### Option A: `russh-sftp`

A maintained SFTP client (and server, unused here) crate. Takes any
`AsyncRead + AsyncWrite`, which a `russh::Channel::into_stream()` already is,
the same conversion `connect_via_within` uses today for a bastion's forwarded
channel. Confirmed by building a throwaway crate against it: resolves
`russh-sftp = "2.4.0"` against our pinned `russh = "0.63.0"` with no version
conflict, because `russh-sftp` does not depend on `russh` at runtime at all,
only as a dev-dependency for its own examples. Apache-2.0, already in
`deny.toml`'s allow list.

Its client API is high-level: `read_dir` for a listing, `open`/`create`
returning a `File` that implements `AsyncRead`/`AsyncWrite` for chunked,
progress-reportable transfer, `Metadata` with `is_dir`/`len`/`permissions`/
`modified`, `rename`, `remove_file`, `symlink_metadata`. First-cut scope
(listing, transfer with progress, cancel) maps onto this directly.

**Cost**: a genuine new runtime dependency, the fourth crate this project has
taken since `russh` itself, and a supply-chain surface `docs/security-model.md`
names explicitly (adversary 4). **Forecloses**: nothing that matters here;
swapping the client later would touch one module, since nothing above `sftp/`
would know which crate opened the channel.

### Option B: Write the SFTP protocol ourselves

The path ADR-0009 took for `known_hosts`: minimal primitives, our own parsing,
full control, one fewer dependency.

`known_hosts` is a text format with one entry per line and a handful of
shapes. SFTP is a binary, stateful, request-correlated protocol with version
negotiation, dozens of packet types, and extensions: a different order of
complexity entirely, and in exactly the area (attacker-controlled names and
lengths) where a subtle framing bug is worst to have written ourselves. ADR-0009 could make
"we get this right, or nobody does" credible for known_hosts's format; the
same claim over a full SFTP implementation is not credible on the same
budget, and a bug in packet framing risks more than a bug in a text parser:
it can desynchronise a client from a still-connected server rather than just
misread one line.

**Cost**: months of protocol work before path safety, the part #127 actually
worries about, gets any attention at all. **Forecloses**: nothing extra
either, but at a much higher price for the same freedom Option A already
gives.

## Decision

Option A. Depend on `russh-sftp` for the protocol, and put this project's own
effort where #127 says the real risk is: the path-safety layer between a
remote name and a local filesystem write, which `russh-sftp` does not attempt
and this project cannot buy from anybody. The traded cost is a fourth
dependency in a project whose pitch is being small and auditable; the traded
benefit is not writing a binary protocol's framing ourselves in the one area
a mistake is most expensive.

## Consequences

**Good**: directory listing, transfer and cancellation come from a
maintained, tested implementation rather than a first attempt at binary
framing. Effort goes to path safety and IPC design, the parts specific to
this application.

**Bad**: one more crate in the dependency graph and one more thing
`cargo-deny`/`cargo-audit` have to keep clean forever. `russh-sftp`'s own
correctness on the wire is now something this project trusts rather than
verifies line by line, the same trade every other transport dependency here
already makes.

**Follow-up**: `sftp/` wraps `russh_sftp::client::SftpSession` behind our own
types, the same way `ssh/connection.rs` wraps `russh::client::Handle` today,
so nothing above that module names `russh-sftp` directly. Path safety and its
property tests are the subject of the implementation work this ADR unblocks,
not of this record. Revisit this decision if `russh-sftp` stops being
maintained or an incompatible `russh` major version breaks the channel/stream
boundary this option counts on staying stable.
