# ADR-0008: Collect credentials in a dedicated window, destroyed after use

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

The client has to accept a password or a private key passphrase from the user.
Section 6 of `CLAUDE.md` says no secret enters React state, `localStorage`, or a
component prop, and rule 1 of `docs/security-model.md` says credentials never
cross the IPC boundary toward the frontend. Neither rule answers the question
this decision has to answer, because both describe the outbound direction: the
user typing a secret is inbound, and it has to exist somewhere in the webview
before it can reach the core at all.

The webview is treated as hostile for one specific reason, stated in
`docs/architecture.md`: it renders output from machines the user does not
control. A malicious host can emit terminal escape sequences, oversized SFTP
listings, and filenames designed to be misread. If a credential exists in the
same JavaScript context that renders that output, one bug in the terminal
rendering path stands between a hostile host and the password.

Two properties of the platform shape the answer:

* **JavaScript cannot erase a string.** Strings are immutable and collected
  whenever the engine chooses, so a secret that has been in a webview cannot be
  zeroized there the way `zeroize` does on the Rust side. The nearest thing
  available is discarding the whole context that held it.
* **Tauri can open more than one window,** each with its own webview and its own
  document, addressed separately over IPC.

Out of scope: keyboard-interactive prompts issued by the remote host itself and
rendered in the terminal. Those are the same problem with worse properties, and
they get their own decision when keyboard-interactive authentication is
implemented.

## Options considered

### Option A: An uncontrolled input in the main window

A `<input type="password">` with no `useState` behind it. The value is read from
the DOM on submit and passed straight to `invoke`. This is what most Tauri and
Electron applications do, and it satisfies section 6 as written: the secret is
never in React state, never in a prop.

It also leaves the secret in the same document that renders remote output, where
`document.querySelector('input').value` reaches it, and leaves it there until
the field is cleared and the engine happens to collect the string. It follows
the letter of the rule and loses the reason the rule exists.

### Option B: A dedicated window that is destroyed after submitting

A second Tauri window whose document mounts the prompt and nothing else. No
terminal, no SFTP listing, no session event is ever routed to it, so it never
renders a byte that came from a remote host. On submit the value goes straight
to the core, and the window is destroyed — which discards the document, its DOM
and its heap, deterministically, rather than waiting for a collector.

The cost is plumbing: a second window to create and address, a request the core
issues and correlates by opaque id, and a lifecycle to get right in the cases
where it is easy to get wrong — the user closing the window, a second prompt
arriving while the first is open, the session being cancelled while the prompt
is up.

### Option C: A native dialog from the Rust side

The core prompts through the platform: `CredUIPromptForWindowsCredentials` on
Windows, an `NSAlert` with a secure text field on macOS, a GTK dialog on Linux.
The secret never enters a webview at all, and lands directly in a `Zeroizing`
buffer. This is the strongest option on security alone.

It is also three implementations with three behaviours, on a project whose
choice of `russh` over the OpenSSH binary was made specifically so that
platforms would not diverge. Linux has no standard credential dialog, so that
third implementation is ours to invent. And it puts an operating-system dialog
in the middle of an application with custom window chrome and an approved visual
identity — the interface is the reason this product exists, and this is the one
option that takes the most security-critical moment in the application and makes
it look like it belongs to someone else.

## Decision

Option B, accepted on 2026-08-22.

A dedicated window, `credential`, renders the prompt. Nothing remote is ever
routed to it. The value is read on submit, passed to the core, and the window is
destroyed immediately afterwards. The core wraps it in a `Zeroizing` buffer on
arrival, uses it, and drops it.

Option B beats A because the reason the webview is untrusted is that it renders
hostile output, and a window that renders none is not the same threat surface —
the separation is structural rather than a promise about which code runs where.
It beats C because the security difference between them is smaller than it looks
once the prompt window renders nothing remote, while the cost difference is not:
one implementation against three, and our interface against the platform's.

The tradeoff accepted is real: the secret still exists in a webview, briefly.
This is a mitigation, not an elimination. An attacker who achieves code
execution inside the credential window itself reads the password, and nothing
here prevents that.

## Consequences

**Good**: the terminal rendering path and the credential path no longer share a
document, so a bug in the first cannot reach the second. Destroying the window
gives a deterministic end to the secret's life in JavaScript, which no amount of
clearing a field can. The prompt is ours to design, so the most security-
critical screen in the application can carry the fingerprint, the host name and
the reason for the prompt in the product's own voice. One implementation covers
all three platforms.

**Bad**: a second window is a lifecycle, and lifecycles are where bugs live —
the window closed without submitting, two prompts racing, a prompt outliving the
session that asked for it, a window that fails to open at all leaving a
connection hanging on a reply that will never come. Each of those is a path that
must be written and tested, and every one of them is worse than the equivalent
bug in a single-window design because the failure mode is a stuck connection
rather than a visible error.

**Bad**: the secret is in a webview. Smaller exposure than Option A, but not
zero, and this ADR should not be read as saying the credential is safe from code
running inside the prompt window.

**Bad**: on some window managers a second window can open behind the main one or
without focus, which is a usability failure that reads as the application
hanging. This needs explicit handling rather than trusting the default.

**Follow-up**: define the request protocol — the core issues an opaque request
id, the window replies with that id and the secret, and an unmatched or repeated
id is refused. Decide what happens when the prompt window is dismissed: the
connection attempt fails with a typed error, it does not retry silently. Cover
the lifecycle paths above with tests, since the error path is what the user
actually hits. Revisit this decision if keyboard-interactive authentication
turns out to need the same prompt for host-issued questions, which have
different properties and may deserve Option C after all.
