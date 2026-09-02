# Architecture

This document describes how Runic SSH is put together and why the boundaries
sit where they do. It is the map; `security-model.md` is the set of rules that
map has to satisfy.

Status: built. `commands/`, `ssh/`, `sftp/`, `vault/`, `config/` and the whole
frontend exist and are what the application runs on. One thing in the tables
below is still the target rather than the tree: tunnels, listed under what
`ssh/` owns. It is marked where it appears. Decisions that are already binding
are recorded in `adr/`.

This document has twice said the tree was behind where it actually was: once
about the source tree overall, and once about the credential window below,
which this revision removes for good rather than correcting again. A stale
architecture document is worse than an absent one in a project that asks to be
audited, because it is where somebody auditing starts.

## Process model

One process, one privileged core, one webview:

```
┌──────────────────────────────┐
│  Main webview (untrusted)    │
│  React + TypeScript          │
│  + xterm.js: remote output   │
│  Renders UI. Holds no        │
│  secrets. No filesystem.     │
└──────────────┬───────────────┘
               │  IPC: named commands + events
               │  Serializable payloads only
┌──────────────┴────────────────────────────────────────────────┐
│  Core (privileged)                                            │
│  Rust + Tokio                                                 │
│  Network, filesystem, OS keychain, crypto                     │
└─────────────────────────────────────────────────────────────────┘
```

The webview is treated as hostile. It renders remote output, including terminal
escape sequences from a machine the user does not control, so every value
crossing into the core is validated on the Rust side regardless of what the
frontend claims to have checked.

A credential is typed into a plain, uncontrolled `<input>` in the host editor's
own Access column, read once through `FormData` at submit and never bound to a
React state value, then the form resets. There used to be a second window
here, a separate document and script a hostile host's output could not reach,
which is what made typing a password safe when there was nowhere else on
screen to type one (ADR-0008). ADR-0032 and ADR-0034 made the wizard the only
place a credential is set, ADR-0039 retired the window once nothing but a
now-obsolete recovery path still opened it, and none of the four re-argued
whether one document was still enough. What is true now: the secret never
becomes a value the render tree can read back, which is the property section
6 of `CLAUDE.md` asks for regardless of how many documents there are, but the
document boundary itself, an XSS anywhere else in this webview being unable
to reach the field at all, is gone. `docs/security-model.md`'s Rule 1 says the
same thing without the history attached.

## Module responsibilities

### Core (`src-tauri/src/`)

| Module | Owns | Never does |
| --- | --- | --- |
| `commands/` | Input validation, delegation, error mapping | Business logic |
| `ssh/` | Connection lifecycle, auth, channels, tunnels (tunnels: target) | Talk to the webview |
| `sftp/` | Directory listing, upload, download, remote-to-remote transfer, recursive folder copy (ADR-0041, ADR-0045, ADR-0049) | Talk to the webview; resume an interrupted transfer, which nothing here does yet |
| `vault/` | Credential storage: the OS keychain, and the run-lifetime store beside it | Return plaintext across IPC |
| `config/` | Session and app settings persistence | Store secrets |

`commands/` is the only module that knows Tauri exists. Everything else is a
plain Rust library that can be unit tested with no webview and no app handle.
That constraint is what keeps the test suite fast and the logic reviewable.

### Frontend (`src/`)

| Directory | Owns |
| --- | --- |
| `ipc/` | Typed wrappers over commands. The only place `invoke` appears. |
| `features/` | State and effects per feature slice: sessions, terminal, chrome, commands, settings, status, sftp |
| `components/` | Presentational components. Props in, markup out. |
| `lib/` | Framework-free helpers |

Confining `invoke` to `src/ipc/` means the entire IPC surface can be read in one
directory, which is what makes the boundary auditable.

## Data flow: opening a connection

It is two commands, not one, and that is the part worth reading. `connect_session`
returns **before** authentication, because the credential for the host the user
clicked is collected in the host editor's own Access column and submitted
separately.

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
