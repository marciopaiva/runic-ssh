# ADR-0054: Forward ports, local, remote and dynamic, from one model

* **Status**: Accepted
* **Date**: 2026-09-02

## Context

The v0.4.0 milestone's own description already commits to this: "Forward
ports over the same transport." Nothing had turned that into a design
until now.

**All three kinds a real SSH client offers (`-L`, `-R`, `-D`) are reachable
with what this project already depends on, not a new crate.**

`Connection::open_forward` (`src-tauri/src/ssh/connection.rs:563-581`)
already opens a `direct-tcpip` channel to an arbitrary endpoint; its own
doc comment names local forwarding directly: "the primitive a chain is
built on, and the one local port forwarding will need." It is already
proven in production, since every ProxyJump hop already opens one to
reach the next host in the chain. A local forward is the same call, with
one incoming local `TcpListener` connection per channel instead of one
call per chain hop.

A remote forward needs the opposite direction: asking the server to
listen on our behalf, and receiving what it accepts. `russh` 0.63
already exposes both halves: `client::Handle::tcpip_forward`/
`cancel_tcpip_forward` (asking), and `Handler::server_channel_open_
forwarded_tcpip` (receiving). Neither is called anywhere in the tree
today; `HostKeyCheck`, the only `client::Handler` this project
implements (`connection.rs:160`), overrides `check_server_key` alone,
so every other trait method, this one included, falls through to the
library's own default.

A dynamic forward (a local SOCKS proxy) needs no new channel primitive
at all: it is `open_forward` again, one call per accepted connection,
with the destination read from a SOCKS4/5 handshake at connect time
instead of being fixed in advance. The only genuinely new work it adds
is a small SOCKS parser, in plain Rust, no dependency.

**The maintainer asked directly for one design covering all three**,
specifically so the storage format and the host editor are not built
once for local forwarding and then reworked when remote and dynamic
arrive. This ADR is that design; the three backends remain separate
issues.

**What this touches that needs the maintainer's own sign-off**: saving a
forward against a host adds a field to `Session`/`SessionDraft`
(`src-tauri/src/config/sessions.rs`), which is the on-disk session
format section 5 of `CLAUDE.md` names directly. The shape below follows
the same `#[serde(default)]` pattern `group`, `credentialId`, `proxyJump`
and `kind` were each added with, no migration step of its own needed,
but the rule is "stop and ask" regardless of how small the change looks,
so this is that stop.

## Options considered

### Option A: Three separate ADRs, one per forward kind

Design and ship local forwarding alone first, decide remote's and
dynamic's own shape later, each against whatever local forwarding
happened to leave behind.

**Cost**: cheapest to write down today. **Forecloses**: exactly what the
maintainer asked to avoid. Remote and dynamic forwards are not local
forwarding with one field changed, they are a different direction and a
different destination-resolution timing respectively; a model built for
one alone is a real rewrite once the second and third arrive, in both
the stored shape and the editor section drawn for it.

### Option B: One unified model, three backends

A single `Forward` shape (kind, bind port, an optional target host and
port, an optional name) covers all three, stored once, edited in one
section of the host book. Each kind is its own implementation issue, but
none of them changes what a `Forward` looks like on disk or on screen.

**Cost**: the shape carries two fields (`target_host`, `target_port`)
that a dynamic forward never uses, always `None` for that kind. A wider
review before any code lands, since the whole shape is being asked for
at once rather than grown incrementally. **Forecloses**: nothing; this
is what Option A is the smaller, rework-prone version of.

### Option C: Local only, for now

Ship local forwarding, decide later whether remote and dynamic are worth
building at all.

**Cost**: cheapest of the three to reason about today. **Forecloses**: the
same thing Option A does, and was named directly and rejected: the
maintainer wants the model and the editor section built once.

## Decision

Option B. One shape:

```rust
enum ForwardKind { Local, Remote, Dynamic }

struct Forward {
    kind: ForwardKind,
    /// Local: the port this machine listens on.
    /// Remote: the port asked of the server.
    /// Dynamic: the local SOCKS listener's port.
    bind_port: u16,
    /// Absent for Dynamic, whose destination is read from the SOCKS
    /// handshake at connect time rather than fixed here.
    target_host: Option<String>,
    target_port: Option<u16>,
    name: Option<String>,
}
```

`Session`/`SessionDraft` each gain `forwards: Vec<Forward>`,
`#[serde(default)]`, the same pattern every other optional per-host field
already uses.

**Saved forwards start when the session connects, the same way OpenSSH's
own `LocalForward`/`RemoteForward`/`DynamicForward` config directives
do**, confirmed directly rather than adding a second, separate "arm this
forward" gesture: saving one against a host already is the deliberate
act, the same weight `proxyJump` or `kind` already carry with no second
confirmation of their own. A forward that fails to bind (the local port
is taken, or the server refuses `tcpip-forward`) says so plainly rather
than failing silently; where that surfaces (the terminal's own status
area is the leading candidate) is implementation detail for the
frontend issue, not fixed here.

**The host editor gains a fourth section, full width, below the General/
Topology and Access columns ADR-0052 already drew**: a list of forward
rows, not a third narrow column, since a forward's own summary ("8080 →
target.internal:80") needs the width a column would not give it. Each
row picks its kind with the same three-pill control `kind_picker()`
already draws for Topology, relabelled; the target fields hide for
Dynamic rather than sitting there disabled.

## Consequences

**Good**: all three forward kinds are reachable with the dependencies
already in `Cargo.toml`, so this adds no new crate and no new Tauri
capability (binding a local `TcpListener` needs neither). The storage
shape and the editor section are built once, covering a feature nobody
has to redesign when the second and third kind land. `open_forward`
being proven already (every jump chain uses it) means local forwarding
in particular starts from a call site with real production mileage, not
a new one.

**Bad**: `Forward`'s own shape carries fields a dynamic forward never
fills, which is a real, if small, cost of unifying three kinds into one
type rather than three. Remote forwarding is the one direction this
project has never driven data through before (the server initiating a
channel to us, not the reverse), which is new surface for
`ssh/connection.rs`'s own `Handler` impl and deserves its own careful
review when that issue is implemented, not assumed safe by analogy to
`open_forward`. Auto-starting on connect means a saved forward that
silently stops mattering (a service on the target that moved) still
tries to bind on every connection; that is the same cost OpenSSH's own
config directives already carry, not a new one this design invents.

**Follow-up**: implementation splits into separate issues per backend
(local, remote, dynamic/SOCKS) plus one for the editor section and
whatever runtime status surface accompanies it, filed alongside this
ADR. Where a failed or stopped forward is shown at runtime is explicitly
left to the frontend issue rather than decided here.
