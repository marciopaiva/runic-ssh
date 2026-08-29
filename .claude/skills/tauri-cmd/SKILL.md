---
name: tauri-cmd
description: Add a Tauri IPC command to Runic SSH end to end: the Rust handler, its error type, registration in lib.rs, the capability check, the typed TypeScript wrapper in src/ipc/, and the error-path test. Use whenever the frontend needs to reach something only the Rust side can do.
---

# Add an IPC command

The IPC boundary is the one place where a mistake is both easy to make and
expensive: it is the seam between untrusted webview input and privileged native
code. Every command follows the same shape so that reviewing one teaches you how
to review all of them.

The command being added is described in `$ARGUMENTS`.

## Language

Everything under Steps below, code, comments, error messages that cross the
boundary, is English: it lands in the tree, and CLAUDE.md section 1 already
covers it. The checklist and any narrative report to the maintainer follow
whatever language they are using in this conversation instead.

## Rules that are not negotiable

* The handler is **thin**. Validate, delegate, map the error. Logic lives in
  `ssh/`, `sftp/`, `vault/`, or `config/`.
* It returns `Result<T, CommandError>` where both `T` and `CommandError` are
  `Serialize`. Never `unwrap()`, never `expect()`, never a panic path reachable
  from the webview.
* No secret appears in a return value, in an error, or in a log line. The
  frontend receives an opaque credential id and nothing more.
* Anything touching the network or the filesystem is `async`.
* No component calls `invoke` directly. The typed wrapper in `src/ipc/` is the
  only caller.

## Steps

### 1. Domain function first

Write the real work in its domain module, with its own error type and its own
unit test. It must be callable and testable without Tauri in the picture. If it
cannot be tested without a webview, it is in the wrong module.

### 2. Error type

Each command module carries a `thiserror` enum that serializes cleanly:

```rust
#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum CommandError {
    #[error("session not found: {0}")]
    SessionNotFound(String),

    #[error("connection failed: {0}")]
    Connection(String),

    #[error("invalid input: {0}")]
    Validation(String),
}
```

Map domain errors into it explicitly. Never `#[from]` an error whose `Display`
you have not read: that is the usual way a passphrase ends up in a UI toast.

### 3. Handler

```rust
#[tauri::command]
pub async fn connect_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<SessionHandle, CommandError> {
    let session = state
        .config
        .get_session(&session_id)
        .ok_or_else(|| CommandError::SessionNotFound(session_id.clone()))?;

    crate::ssh::connect(&session)
        .await
        .map_err(|e| CommandError::Connection(e.redacted()))
}
```

Note `redacted()`. Domain errors carry detail useful in a local log; what
crosses the boundary is the sanitized form.

### 4. Register it

Add the handler to `tauri::generate_handler![...]` in `src-tauri/src/lib.rs`.
An unregistered command fails at runtime with a message that reads like a
frontend bug, so register it in the same edit that creates it.

### 5. Check whether this needed a capability, not whether it needs one added

A command you write yourself and register through `generate_handler!` is not
gated by `src-tauri/capabilities/*.json`. That ACL governs the Tauri **plugin**
surface, `core:window:*`, `core:event:*`, and so on, and nothing in
`capabilities/` names an application command; grep for one and you will find
none. Adding a permission entry for the command itself is a no-op, and writing
one would look like a control that is not there.

There is a real check, just a different one. Ask what the domain function
underneath the handler actually does, not what the handler is called:

* Does it call a Tauri plugin API under the hood, filesystem, shell, dialog, or
  open a new window? Then that plugin's permission may need to widen, or a new
  window may need its own capability file, the way `credential.json` is its own
  file rather than a line added to `default.json`.
* If it only touches `ssh/`, `sftp/`, `vault/`, or `config/` through plain Rust,
  as most commands do, `capabilities/` is untouched. Say so plainly rather than
  leaving the question unanswered.

Either way this is CLAUDE.md 7.6: widening a capability is a Phase 2 proposal
with an ADR, decided before this skill runs, never inside it.

### 6. Typed wrapper

In `src/ipc/`, one file per command module:

```ts
import { invoke } from "@tauri-apps/api/core";

export type SessionHandle = {
  id: string;
  host: string;
  connectedAt: string;
};

export type CommandError = {
  kind: "SessionNotFound" | "Connection" | "Validation";
  message: string;
};

export async function connectSession(sessionId: string): Promise<SessionHandle> {
  return invoke<SessionHandle>("connect_session", { sessionId });
}
```

The argument name is camelCase on the TypeScript side and snake_case in Rust;
Tauri converts between them. Getting this wrong produces a runtime error with a
misleading message, so check it against the handler signature.

Keep the TypeScript types in step with the Rust types by hand, in the same
commit. A drifted IPC type is a bug that only shows up in production.

### 7. Test the error path

Every command gets at least one test covering the failure case, because the
failure case is what users actually hit:

```rust
#[tokio::test]
async fn connect_session_rejects_unknown_id() {
    let state = AppState::in_memory();
    let err = connect_session(tauri::State::from(&state), "nope".into())
        .await
        .unwrap_err();
    assert!(matches!(err, CommandError::SessionNotFound(_)));
}
```

Also assert that a credential-bearing failure does not leak: given a wrong
password, the returned error must not contain it.

### 8. Gate

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
pnpm typecheck
```

## Checklist before reporting

- [ ] Domain logic sits outside the handler and is unit tested
- [ ] Handler has no `unwrap`, `expect`, or panic path
- [ ] Error type serializes and carries no secret
- [ ] Registered in `generate_handler!`
- [ ] Said plainly whether `capabilities/` needed a change, and why or why not
- [ ] Typed wrapper exists in `src/ipc/`; no direct `invoke` in components
- [ ] Argument casing matches between Rust and TypeScript
- [ ] Error-path test passes, including the no-leak assertion
