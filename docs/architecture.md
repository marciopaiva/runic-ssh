# Architecture

This document describes how Runic SSH is put together and why the boundaries
sit where they do. It is the map; `security-model.md` is the set of rules that
map has to satisfy.

Status: the design is settled, the source tree is not yet written. Sections
below describe the target. Decisions that are already binding are recorded in
`adr/`.

## Process model

Tauri gives us two sides of one process:

```
┌─────────────────────────────────────────────────┐
│  Webview (untrusted)                            │
│  React + TypeScript + xterm.js                  │
│  Renders UI. Holds no secrets. No filesystem.   │
└────────────────────┬────────────────────────────┘
                     │  IPC: named commands + events
                     │  Serializable payloads only
┌────────────────────┴────────────────────────────┐
│  Core (privileged)                              │
│  Rust + Tokio                                   │
│  Network, filesystem, OS keychain, crypto       │
└─────────────────────────────────────────────────┘
```

The webview is treated as hostile. It renders remote output, including terminal
escape sequences from a machine the user does not control, so every value
crossing into the core is validated on the Rust side regardless of what the
frontend claims to have checked.

## Module responsibilities

### Core (`src-tauri/src/`)

| Module | Owns | Never does |
| --- | --- | --- |
| `commands/` | Input validation, delegation, error mapping | Business logic |
| `ssh/` | Connection lifecycle, auth, channels, tunnels | Talk to the webview |
| `sftp/` | Directory listing, transfer, resume | Talk to the webview |
| `vault/` | Credential storage over the OS keychain | Return plaintext across IPC |
| `config/` | Session and app settings persistence | Store secrets |

`commands/` is the only module that knows Tauri exists. Everything else is a
plain Rust library that can be unit tested with no webview and no app handle.
That constraint is what keeps the test suite fast and the logic reviewable.

### Frontend (`src/`)

| Directory | Owns |
| --- | --- |
| `ipc/` | Typed wrappers over commands. The only place `invoke` appears. |
| `features/` | State and effects per feature slice: sessions, terminal, sftp, vault |
| `components/` | Presentational components. Props in, markup out. |
| `lib/` | Framework-free helpers |

Confining `invoke` to `src/ipc/` means the entire IPC surface can be read in one
directory, which is what makes the boundary auditable.

## Data flow: opening a connection

1. User picks a saved session in the UI.
2. `features/sessions` calls `ipc/sessions.connectSession(id)`.
3. The `connect_session` command looks the session up in `config/`. It receives
   an id, never a credential.
4. `vault/` resolves the credential reference against the OS keychain, inside
   the core, at the moment of use.
5. `ssh/` opens the transport, verifies the host key, authenticates, and
   zeroizes the key material.
6. The core returns an opaque `SessionHandle`. No secret is in it.
7. Terminal output streams to the webview as Tauri events, keyed by handle.

The credential exists in memory in the core for the duration of authentication
and nowhere else. It is never serialized toward the webview, never written to
disk by us, and never logged.

## Concurrency

One Tokio task per active SSH session. Channels within a session are multiplexed
by `russh` over the single transport, which is what SSH is for. The IPC handler
thread is never blocked: every command that touches the network or the disk is
`async`.

Terminal output is pushed to the webview as events rather than polled, and
batched so that a noisy remote process cannot flood the IPC channel one byte at
a time.

## Persistence

| Data | Location | Format |
| --- | --- | --- |
| Sessions, settings | Platform config dir | JSON, no secrets |
| Credentials | OS keychain | Opaque, keyed by session id |
| Known hosts | Platform config dir | OpenSSH `known_hosts` format |

Using the OpenSSH format for known hosts is deliberate: the user can inspect it
with tools they already trust, and import from an existing setup.

## What is deliberately not here

* **No agent forwarding in v1.** It is a real security tradeoff and deserves its
  own ADR before it ships.
* **No cloud sync in v1.** Syncing an SSH client's session list is a data
  protection problem, not a feature toggle.
* **No shelling out to `ssh`.** See `adr/0003-use-russh-instead-of-openssh.md`.
