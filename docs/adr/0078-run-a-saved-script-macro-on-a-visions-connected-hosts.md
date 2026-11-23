# ADR-0078: Run a saved script macro on a vision's connected hosts

* **Status**: Accepted; amended by ADR-0080, which removed visions, so the fleet run starts from host groups instead
* **Date**: 2026-11-22

## Context

Comparing hosts today means broadcasting into several terminals and reading
them side by side (ADR-0019, ADR-0065). Broadcast types into interactive ptys,
so nothing about what came back is structured: no exit status, no separation
of stdout from stderr, no way to say "seven of these eight answered the same".
Issue #467 asks for that comparison.

What the tree already has:

* `Connection::run_command` (`ssh/connection.rs`) opens one exec channel per
  call and reads it to `Close`. It returns stdout and the exit status. Stderr
  is discarded, and there is no deadline and no output cap.
* Every caller of it (Monitor, journal, tail, sysinfo, ports, processes,
  systemd) passes a command string the core owns. `docs/security-model.md`
  ("What Monitor runs on a host") records that the IPC surface takes a session
  id, a unit name or a path, never a command, and that the core does not grow
  that list without its own decision.
* A script macro (ADR-0070) is saved text with a `kind`. Its execution model
  is already isolated: the text is piped into a fresh interpreter chosen by a
  leading `#!` line, with `$host`, `$port` and `$username` exported as that
  interpreter's own variables. Today that wrapping lives in the frontend
  (`features/macros/script.ts`) and the result is typed into a pty.
* A vision names components, and a component names a saved host by id
  (`config/workspace.rs`). A component is not a live session, so a member of a
  vision may not be connected.
* A host can refuse channels. OpenSSH's default `MaxSessions` is 10, and
  ADR-0014 and ADR-0077 already spend some of that on shells and SFTP.
* `security-model.md` requires that a remote host cannot exhaust memory by
  what it sends, and CLAUDE.md section 6 requires a teardown path for anything
  that outlives its call.

Running one command on several hosts reaches further than looking at one host,
which is the same property that made synchronised typing off by default.

## Options considered

### Option A: Free text through a new batch exec command

The frontend sends a command string and a list of handles. Results are
structured, and a confirmation shows the targets first.

It is the most flexible and the most useful on a bad night. It also breaks the
rule that the frontend never hands the core a command it just composed, so the
whole exposure becomes "whatever a person or a compromised webview types".
Every other safeguard (target preview, destructive-pattern checks) would be
guessing at intent, which `security-model.md` already declines to do for macro
text.

### Option B: A saved script macro, by id (chosen)

The frontend sends a macro id and a list of handles. The core loads the macro
from its own store, refuses any that is not `kind: script`, builds the command
itself, runs it with limits and returns structured results.

The text that runs was written and saved on purpose before the run. The IPC
surface still carries ids, not command text.

### Option C: Type the macro into each pty and scrape the screen

No new exec surface. Output has no boundaries, so a result would be a guess:
prompts, echoes and escape sequences are part of it, and equality across hosts
would depend on each host's prompt. Rejected for reliability, not for safety.

## Decision

Option B, with these fixed points:

1. **One new IPC command**, `fleet_run`, taking a macro id and a list of
   session handles, and nothing else. No command text crosses IPC. Adding a
   command is a non-breaking change to the contract; no existing caller moves.
2. **Script macros only.** A sequential macro depends on an interactive shell
   (its aliases, its working directory, its pty). Run through exec it would
   mean something different on each host, so it is refused with a typed error.
   The macro editor already offers the script kind for exactly this.
3. **The core builds the command.** The heredoc wrapping and the three
   exported variables move to Rust, with the same semantics as
   `features/macros/script.ts`. The interpreter named by `#!` is accepted only
   if it matches `[A-Za-z0-9_.-]+`, otherwise it falls back to `sh`, so a
   `#!` line cannot add shell syntax. `host`, `port` and `username` come from
   the saved session record for each handle and are single-quoted.
4. **Only already connected sessions.** A handle is a live session by
   construction. A vision member with no live session is reported as skipped.
   Nothing here opens a connection, asks for a credential or shows a host key
   prompt, so credential handling and host key verification are untouched.
5. **A bounded run.** A new method beside `run_command`, leaving it as it is,
   returns stdout and stderr separately, the exit status, and two flags
   (`truncated`, `timed_out`). Each stream is capped at 64 KiB per host and a
   host has a 30 second deadline. Both values are constants in the core. The
   channel is closed when the deadline passes, so nothing keeps reading.
6. **One run at a time, one exec channel per host.** Hosts run concurrently
   with each other, but a run never opens a second channel on a connection, so
   it adds at most one to that host's `MaxSessions` count while it lasts.
7. **Confirmation always.** The frontend lists the macro's name and text and
   every target host, and runs only after the person confirms. There is no
   threshold below which it skips this.
8. **Equality is byte for byte.** Results are grouped by exit status, stdout
   and stderr exactly as received. Normalising host names or timestamps would
   hide a real difference, so it is not done in this version.
9. **Nothing is persisted or logged.** Results live in memory for the open
   panel and are dropped when it closes. Output is rendered as text with
   control characters escaped, as terminal output already is.

The tradeoff accepted: a person who wants to run a one-off command on many
hosts must save it as a script macro first. That friction is the point of the
option, and it is the reason this can be proposed without a command allow-list.

## Consequences

**Good**: Comparing hosts becomes one action with a structured answer. The new
exposure is bounded by what the person saved, what they confirmed, which hosts
are already connected, and fixed output and time limits. The existing
`run_command` callers are unaffected.

**Bad**:

* The IPC invariant "the frontend never sends a command" becomes "the frontend
  sends only ids of text it saved". A compromised webview could save a macro and
  then run it. That reach is not new: it can already write into every open pty
  through `send_input`, and synchronised typing broadcasts to all of them. What
  this adds is a second path, not a wider one. `security-model.md` must say so
  plainly rather than imply the invariant is intact.
* The wrapping logic exists twice, in TypeScript for typing into a pty and in
  Rust for exec, and the two must stay equivalent. A shared test vector file
  reduces the risk and does not remove it.
* Output can contain secrets (a script that prints a file). It is held in
  memory only, but it is on screen, and a screenshot or a shared session
  carries it.
* A host with `MaxSessions` already exhausted fails its run with a transport
  error, which cannot be told apart from other channel failures.
* The 64 KiB and 30 second limits are guesses until measured against real use,
  and a script that legitimately runs longer is reported as timed out.
  First measured against the OpenSSH fixtures on 2026-11-22 and kept, see
  `docs/measurements/fleet-limits.md`. That measurement is loopback only.

**Follow-up**:

* A new section in `docs/security-model.md`, "What a fleet run carries",
  written with the implementation and covering the second path above.
* Tests: the command builder (quoting, interpreter fallback, a delimiter in the
  script text), the bounded runner against the SSH fixtures (large output,
  hung command, stderr only, non-zero exit), the error path of `fleet_run`
  (unknown macro, sequential macro, unknown handle), and the grouping function.
* Revisit if people ask for running free text (Option A) after using this, or
  for sequential macros, or for hosts that are not connected, which would need
  its own decision about credentials and host key prompts.
