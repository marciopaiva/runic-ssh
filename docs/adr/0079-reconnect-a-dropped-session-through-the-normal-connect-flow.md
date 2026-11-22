# ADR-0079: Reconnect a dropped session through the normal connect flow

* **Status**: Accepted (option A chosen by the maintainer, 2026-11-22)
* **Date**: 2026-11-22

## Context

When a connection drops, the terminal says nothing useful and the person
reconnects by hand, losing the scrollback with the tab's terminal. Clients
exist (Mosh, Eternal Terminal) because of this, and it is the field note
behind this decision.

What the tree does today:

* A connection is built by the frontend (`features/sessions/use-connect.ts`):
  `connectSession` opens it and decides the host key, then
  `authenticateWithSaved` resolves the saved credential against the keychain
  **on every call**, and `onOpened` in `App.tsx` attaches the handle, starts
  the saved forwards and focuses the tab.
* A shell's close reaches the frontend as `CLOSED_EVENT` with only an exit
  status (`commands/terminal.rs`). A typed `exit` and a dead network look the
  same: `exitStatus` is `null` for both (#281).
* russh runs with no keepalive and no inactivity timeout
  (`ssh/connection.rs`, `CONNECT_TIMEOUT` comment). A cut network therefore
  leaves a half-open connection whose channel never closes, sometimes for
  hours. Nothing notices a drop that sends no FIN.
* `useTerminal` builds the xterm in an effect that depends on the handle
  (ADR-0014), so a different handle means a new terminal and no scrollback.
* A reconnect gets a new handle. Everything holding the old one (SFTP panes,
  Monitor, tunnels, a second shell) is bound to a connection that is gone.
* CLAUDE.md section 5 puts credential lifetime and host key verification on
  the stop and ask list.

## Options considered

### Option A: Reconnect with the existing connect flow, keep the terminal

The core says when a close was a lost connection. The frontend then runs
`connect(sessionId)` again on a backoff, and the terminal re-binds to the new
handle without being rebuilt. Chosen.

It reuses the one path that already verifies host keys and resolves
credentials, so there is no second implementation of either. It costs a
refactor of how the terminal depends on the handle, and it leaves the old
handle's other users to deal with its loss.

### Option B: Detect the drop, offer a button

Same detection and banner, no automatic retry. The person clicks and the
normal flow runs. No unattended use of a credential at all, and cheap. It
does not deliver a session that survives, which is the point of the idea.

### Option C: A supervisor in the core with a stable handle

The core swaps the connection inside the registry entry, so every user of the
handle keeps working. The host key decision, the jump chain and the
credential prompts are orchestrated by the frontend today
(`commands/sessions.rs`, 1696 lines), so this means reimplementing them in the
core. Rejected on cost: it would be a second connect path with its own bugs in
the code that matters most.

## Decision

Option A, with these fixed points:

1. **The credential is resolved again on every attempt.** A reconnect is
   `connect(sessionId)` followed by `authenticateWithSaved`, which reads the
   keychain each time. Nothing is held in memory between a drop and a retry,
   so this adds no lifetime to any secret. The maintainer decided this
   explicitly.
2. **A host with no saved or kept credential does not reconnect by itself.**
   The banner offers a Reconnect button that runs the ordinary flow, which
   asks for the credential as it always does. A typed password is never
   replayed.
3. **A changed host key stops the retries.** The decision comes first in the
   normal flow and is not bypassed: a reconnect that meets a changed key stops
   and shows the usual block. Backoff never turns a key mismatch into
   something that gets retried.
4. **The core reports a lost connection.** `ClosedEvent` gains
   `connection_lost: bool`, true when the shell closed without an exit status
   and the connection is gone. An additive field: existing readers ignore it.
5. **Keepalive makes a silent drop visible.** The connection config sets a
   keepalive of 30 s with a limit of 3 missed replies, so a half-open
   connection closes after about two minutes (120 s measured against a
   paused sshd) and the event above fires.
6. **Backoff is 1 s, 2 s, 4 s, then 8 s, 16 s, capped at 30 s, for 8
   attempts.** After the last the banner stays with a manual button. Every
   timer has a cancel path that runs when the tab closes, the person
   cancels, or a reconnect succeeds (CLAUDE.md section 6).
7. **The terminal outlives its handle.** The xterm instance depends on the
   container only, and a second effect binds it to the current handle. Its
   scrollback survives a reconnect. The drop is written into it as one dim
   line, so it reads as a mark in the history.
8. **The old handle is closed.** After a drop the dead connection is
   disconnected so the registry does not keep it.
9. **What rode the old handle is not rebound in this version.** Saved
   forwards restart, because `onOpened` starts them for any new connection.
   SFTP panes, Monitor and ad hoc tunnels are bound to the old handle and
   report their normal failure.
10. **tmux and screen reattach is a second change.** It needs a per-host
    setting on disk (a new optional field on `Session`) and a core-owned
    command, so it gets its own pull request and is not part of this one.
    Done in #477's follow-up: `Session.multiplexer`, absent by default and
    additive on disk. The shell runs `tmux new-session -A -s runic-<id>` (or
    `screen -xRR -S`) through an exec request on the pty, with a fallback to
    the login shell when the program is missing. Only the primary shell.

The tradeoff accepted: unattended retries mean the client keeps trying to log
in to a host while the person is away, and the keepalive keeps an idle session
alive that a server would otherwise have timed out.

## Consequences

**Good**: A drop becomes a visible, recoverable event with the history kept.
No new place handles a credential or a host key.

**Bad**:

* Keepalive is traffic. It stops idle timeouts on the server from closing a
  session the person left on purpose. This was the reason the earlier code
  avoided it, and it applies to every session, not only those that reconnect.
* Eight attempts at 30 s ceilings can look like a failed login to a host's
  intrusion detection if the credential has been changed since it was saved.
* The pane, Monitor and tunnel users of the old handle break until the person
  reopens them. A follow-up has to rebind them.
* A host that is slow to notice the old connection may still hold the old
  shell when the new one opens.

**Follow-up**:

* tmux and screen reattach, with the host setting and the migration it needs.
* Rebinding SFTP panes, Monitor and ad hoc tunnels to the new handle.
* An off switch for the keepalive, if the idle-timeout cost is felt. Done per
  host (`Session.keepalive`, on by default and absent from the file while on).
* Revisit if people want a reconnect that survives the app being closed,
  which this does not attempt.
