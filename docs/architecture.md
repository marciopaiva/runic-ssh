# Architecture

This document describes how Runic SSH is put together and why the boundaries
sit where they do. It is the map; `security-model.md` is the set of rules that
map has to satisfy.

Status: mostly built. `commands/`, `ssh/`, `vault/`, `config/` and the whole
frontend exist and are what the application runs on. Two things in the tables
below are still the target rather than the tree: the `sftp/` module, which no
file corresponds to yet, and tunnels, listed under what `ssh/` owns. Both are
marked where they appear. Decisions that are already binding are recorded in
`adr/`.

That line used to say the source tree was not yet written, which was true when
it was typed and quietly stopped being true. A stale architecture document is
worse than an absent one in a project that asks to be audited, because it is
where somebody auditing starts.

## Process model

One process, one privileged core, and two webviews that are equally untrusted:

```
┌──────────────────────────────┐  ┌────────────────────────────┐
│  Main webview (untrusted)    │  │  Credential window         │
│  React + TypeScript          │  │  Its own document          │
│  + xterm.js: remote output   │  │  and its own script        │
│  Renders UI. Holds no        │  │  No terminal in it         │
│  secrets. No filesystem.     │  │  ADR-0008                  │
└──────────────┬───────────────┘  └─────────────┬──────────────┘
               │  IPC: named commands + events  │
               │  Serializable payloads only    │
┌──────────────┴────────────────────────────────┴──────────────┐
│  Core (privileged)                                           │
│  Rust + Tokio                                                │
│  Network, filesystem, OS keychain, crypto                    │
└──────────────────────────────────────────────────────────────┘
```

The webview is treated as hostile. It renders remote output, including terminal
escape sequences from a machine the user does not control, so every value
crossing into the core is validated on the Rust side regardless of what the
frontend claims to have checked.

A password is typed into the **second** window, not the first. Two documents
means a script running in the one that renders a hostile host's output cannot
reach the one holding a secret, and the prompt has no terminal in it to be
reached from. That is ADR-0008 and it is the reason the credential flow looks
more complicated than a modal would.

## Module responsibilities

### Core (`src-tauri/src/`)

| Module | Owns | Never does |
| --- | --- | --- |
| `commands/` | Input validation, delegation, error mapping | Business logic |
| `ssh/` | Connection lifecycle, auth, channels, tunnels (tunnels: target) | Talk to the webview |
| `sftp/` (target) | Directory listing, transfer, resume | Talk to the webview |
| `vault/` | Credential storage: the OS keychain, and the run-lifetime store beside it | Return plaintext across IPC |
| `config/` | Session and app settings persistence | Store secrets |

`commands/` is the only module that knows Tauri exists. Everything else is a
plain Rust library that can be unit tested with no webview and no app handle.
That constraint is what keeps the test suite fast and the logic reviewable.

### Frontend (`src/`)

| Directory | Owns |
| --- | --- |
| `ipc/` | Typed wrappers over commands. The only place `invoke` appears. |
| `features/` | State and effects per feature slice: sessions, terminal, chrome, commands, settings, status (sftp: target) |
| `components/` | Presentational components. Props in, markup out. |
| `lib/` | Framework-free helpers |

Confining `invoke` to `src/ipc/` means the entire IPC surface can be read in one
directory, which is what makes the boundary auditable.

## Data flow: opening a connection

It is two commands, not one, and that is the part worth reading. `connect_session`
returns **before** authentication, because the credential for the host the user
clicked is collected in a window of its own and submitted separately.

1. User picks a saved session in the UI.
2. `features/sessions` calls `ipc/sessions.connectSession(id)`.
3. The `connect_session` command looks the session up in `config/`. It receives
   an id, never a credential.
4. `ssh/` opens the transport and verifies the host key. Five verdicts are
   possible and only one of them continues: a key that is not already trusted
   **rejects here**, carrying which of the other four it was. There is no path
   that proceeds on an untrusted key.
5. The core returns an opaque `SessionHandle`. No secret is in it, and nothing
   has authenticated yet.
6. `authenticate_session` carries the secret, typed on the wizard's own inline
   field for a host it is registering or editing (ADR-0032, ADR-0034).
   `authenticate_with_saved` names the session and resolves it in the core
   instead, when one is saved or kept. An ordinary Sessions connect that finds
   neither collects nothing here: it sends the user to that host's own wizard
   entry to answer through the first path instead (ADR-0039). Whichever path
   it took, `ssh/` authenticates and the key material is zeroized.
7. Terminal output streams to the webview as Tauri events, keyed by handle.

The credential exists in memory in the core for the duration of authentication
and nowhere else. It is never serialized toward the webview, never written to
disk by us, and never logged.

### When the host is behind a bastion

Step 4 becomes the whole chain, still inside `connect_session`, and the order is
the security content (ADR-0023):

1. The bastion's key is verified, and rejects the same way.
2. The bastion is authenticated. Its credential comes from an already-open
   connection to it, then the keychain, then a window of its own (ADR-0027).
3. A channel is opened through it.
4. The far host's key is verified over that channel, and its credential is
   collected afterwards exactly as above.

The far session's key exchange and authentication run end to end with the far
host, so the bastion forwards ciphertext it cannot read. A bastion already open
is ridden rather than opened twice, and the connection is held by a count: the
last session to leave closes it (ADR-0024).

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
| Credentials kept for the run | Core process memory only | Written nowhere, gone on exit (ADR-0025) |
| Known hosts | Platform config dir | OpenSSH `known_hosts` format |

Using the OpenSSH format for known hosts is deliberate: the user can inspect it
with tools they already trust, and import from an existing setup.

## What is deliberately not here

* **No agent forwarding in v1.** It is a real security tradeoff and deserves its
  own ADR before it ships.
* **No cloud sync in v1.** Syncing an SSH client's session list is a data
  protection problem, not a feature toggle.
* **No shelling out to `ssh`.** See `adr/0003-use-russh-instead-of-openssh.md`.
