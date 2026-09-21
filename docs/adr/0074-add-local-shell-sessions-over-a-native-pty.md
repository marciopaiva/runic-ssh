# ADR-0074: Add local shell sessions over a native PTY

* **Status**: Accepted; the maintainer confirmed directly on 2026-09-19 that
  local sessions enter this round rather than staying parked. The
  `capabilities/default.json` line the Decision anticipates below was
  confirmed unnecessary by the Phase 1 security review (#418): see
  `docs/security-model.md`, "What a local shell runs".
* **Date**: 2026-09-19

## Context

Runic SSH has never started a process on the machine it runs on. `russh`
speaks to a remote host over a channel the user configured; every session,
tab and rectangle the app shows today (`Focus`, `features/chrome/focus.ts`)
is one of exactly three kinds: `session` (a remote SSH connection),
`editor` (a host form), `settings`. A macro's `script` step runs an
interpreter through a heredoc, but over an already-authenticated remote
channel, on the far host, not on the user's own machine.

`nav-proposal-v7.html` (section 04) draws a fourth kind: a local shell,
PowerShell, Command Prompt or WSL distribution on Windows, the user's
`$SHELL` on macOS and Linux, opened the same way a saved host is, through
the "+" palette ADR-0072 gives the SSH pill. The mockup's own audit table
flags this piece correctly: it is the one item in the whole proposal that
trips every clause of CLAUDE.md section 5 at once. A real interactive local
shell (resize, color, a cursor that survives a redraw) needs a native
pseudo-terminal, ConPTY on Windows and a POSIX PTY on macOS and Linux, which
this project does not have today. That is a new crate (`portable-pty` is
the natural candidate, already used by other cross-platform Rust
terminals) and a new Tauri capability, since spawning a process on the
user's own machine is not something any existing command does or is
permitted to do.

This document exists because the maintainer confirmed directly, when asked,
that local sessions belong in this round of ADRs rather than staying parked
the way P2P shared sessions already are. Confirming that only settles
*whether* to propose this now, not what the proposal is; both remain open
here for the same stop-and-ask reason CLAUDE.md section 5 names adding a
dependency and widening a capability as decisions that need this document
before any code, not after.

## Options considered

### Option A: `portable-pty`, one command surface, `Focus` gains a fourth kind

Add `portable-pty` to `src-tauri/Cargo.toml`. A new `commands/local_shell.rs`
exposes `open_local_shell(kind: LocalShellKind) -> SessionId`,
`write_local_shell`, `resize_local_shell`, `close_local_shell`, mirroring the
existing terminal command shape (`commands/terminal.rs`,
`commands/sessions.rs`) so the frontend's xterm wiring is unchanged; only
what is on the other end of the pty differs from what is on the other end
of an SSH channel. `LocalShellKind` is `PowerShell`, `Cmd`, `Wsl(String)` on
Windows and a single `DefaultShell` variant elsewhere, detected once at
startup the way the mockup's palette groups them (`Local`, with `WSL:
Ubuntu-24.04` read from `wsl.exe -l -q` or equivalent). `Focus` gains a
fourth variant, `{ kind: 'local'; sessionId: string }`, alongside the
existing three. A new permission,
`runic:allow-open-local-shell` (naming to match the existing custom-command
permission convention once Phase 1 confirms it), is added to
`capabilities/default.json`.

**Cost**: one new dependency, one new capability grant, one new `Focus`
variant threaded through every place that already matches on `session` /
`editor` / `settings` (`stripEntries` and its callers, `App.tsx`'s focus
resolution). No IPC contract change to any *existing* command, no
stored-session format change: a local shell is never saved, so
`config/`'s on-disk format is untouched. **Forecloses**: nothing about how
SSH sessions work; a local shell is additive.

### Option B: Shell it out through `std::process::Command`, no PTY

Spawn the user's shell as a plain child process with piped stdio, no
pseudo-terminal. Simpler dependency story: no `portable-pty`, just the
standard library.

**Cost**: smaller on paper, but the result is not what the mockup shows or
what "a local shell tab" means to a user who already has one open in a real
terminal. Piped stdio has no notion of a terminal size, so curses-style
programs (`vim`, `htop`, a shell's own line editor) misbehave or refuse to
run interactively; color and cursor movement depend on the child believing
it has a tty, which piped stdio does not provide. **Forecloses**: doing this
properly later without redoing the command surface, since the frontend
would need to be told the difference between a real pty and a pipe once
Option A's dependency is added anyway.

### Option C: Park it, the way shared sessions already are

Write down the shape (this document, minus a Decision) and stop. Local
shells stay a documented idea, not a dependency.

**Cost**: none. **Forecloses**: shipping this in the same round as
ADR-0072/ADR-0073, which is a real cost given the maintainer's own answer
was to include it now, not later.

## Decision

Option A. Option B produces something that looks like a local shell in a
screenshot and is not one in use, curses programs are not an edge case for
a terminal application, they are half of what a shell is for; paying for a
real pty once is cheaper than shipping a broken one and replacing it. Option
C contradicts the maintainer's own confirmed answer for this round.

`portable-pty` is added to `src-tauri/Cargo.toml` at its current stable
version, pinned like every other dependency in the tree. `commands/
local_shell.rs` is thin per CLAUDE.md section 3: it validates
`LocalShellKind`, delegates spawning and I/O to a new domain module
(`local_shell/`, sibling to `ssh/`, `sftp/`, `vault/`, `config/`, not inside
`ssh/`, since it shares no code with the SSH channel path beyond the pty-to-
xterm framing already common to `terminal.rs`), and maps errors through the
same `thiserror`-per-module convention. `capabilities/default.json` gains
exactly the permissions the new commands need, named and justified the way
every existing line there already is, per its own file header.

A local shell process is a resource with a lifetime, per CLAUDE.md's "
Anything that outlives the call that started it": it gets a registry entry
and a teardown path the same way `ssh/registry.rs` already tracks
`has_shell` for a different reason (ADR-0014), and a test proves the
teardown runs on tab close and on app exit, not only on the happy path.

## Consequences

**Good**: the app can offer exactly what `nav-proposal-v7.html` shows,
a real, resizable, interactive local shell, using a crate purpose-built for
this and already proven in other Rust terminal applications, rather than a
half-working approximation. `Focus`'s existing three-way match becomes a
forcing function: every place that handles `session`/`editor`/`settings`
today has to decide what a `local` focus means to it, which surfaces gaps
(does broadcast reach a local shell? does a macro target one?) at compile
time instead of at review time.

**Bad**: a new runtime dependency and a new capability are exactly the two
things CLAUDE.md section 5 asks the maintainer to weigh before code exists,
not after. The maintainer weighed them directly (2026-09-19, confirming local
sessions enter this round) before this Status line moved to `Accepted`, but
the dependency itself is not added by this document: `portable-pty` still
lands in `Cargo.toml` only at Phase 4, after the security-model review below.
`portable-pty` runs a process the application has never run before, which
is new attack surface (a local shell is not a remote credential, but a
malformed `LocalShellKind` or an unbounded output buffer from a runaway
local process are new failure shapes this project has not had to reason
about) and needs its own review pass in `docs/security-model.md` before
Phase 4, not folded silently into the general implementation.

**Follow-up**: whether broadcast (ADR-0020/0021/0022) or a macro
(ADR-0070) can target a local shell focus is explicitly not decided here;
`inputTargets()` and `SyncToggle`'s current assumptions are all written
against remote sessions and need their own look once this lands. Whether a
local shell can be saved as a reopenable tab across restarts, the way an
SSH session's connection details are, is also not decided here: the mockup
shows it opened fresh each time, and this document does not propose
changing that.
