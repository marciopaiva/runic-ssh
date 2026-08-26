# Security model

An SSH client holds the keys to every machine its user administers. A bug here
does not corrupt a document; it hands over production. This document states what
we are protecting, from whom, and the rules that follow.

## Assets

| Asset | Why it matters |
| --- | --- |
| Private keys and passphrases | Direct access to every host they authenticate to |
| Passwords | Same, and usually reused across hosts |
| Known hosts database | Its integrity is what makes MITM detectable |
| Session inventory | Names and addresses of infrastructure; useful to an attacker even without credentials |
| Terminal contents | Frequently contains tokens, dumps, and customer data in transit |
| A live session on a bastion | An authenticated foothold in front of everything behind it, held open by us and not asked for directly by anybody |

## Adversaries we design against

1. **A malicious or compromised remote host.** The user connects; the host sends
   hostile terminal output, oversized SFTP listings, or malformed protocol
   messages. This is the adversary we are most exposed to, because connecting to
   untrusted hosts is the product's purpose.
2. **A network attacker.** Can intercept and modify traffic. Defeated by host
   key verification, and only by host key verification.
3. **Another local process without root.** Reads our config files, our logs, our
   temporary files, and our memory if we make it easy.
4. **A supply chain attacker.** Lands code through a dependency. Countered by
   keeping the dependency count small and every addition deliberate.

Out of scope: an attacker with root on the user's machine, or physical access to
an unlocked session. At that point the OS keychain is already open and no
application-level control helps.

## Rules

These are the rules in section 7 of `CLAUDE.md`, with the reasoning attached.

### 1. Credentials never cross IPC toward the frontend

The webview renders content from untrusted hosts. Any secret that reaches it is
one XSS or one malicious escape sequence away from exfiltration. The frontend
holds an opaque id; the core resolves it at the moment of use.

A credential is collected in a **window of its own**, which is a second webview
with its own document and its own script (ADR-0008). That is not a layout
choice. The window that renders a remote host's output and the window that holds
a password are different documents, so a script running in the first cannot
reach the second, and the prompt has no terminal in it to be reached from.

There are two places a resolved credential can come from, and both are inside
the core. The OS keychain is one. The other is a store that lives for the length
of the process and is written nowhere (ADR-0025), which is what somebody with no
working secret service is offered instead of a choice they cannot use. A secret
held there survives a reconnection and does not survive a restart, which is
exactly what the user was told when they picked it.

### 2. Nothing secret is ever logged

Not at any level, not in panic messages, not in errors returned to the UI. Logs
get pasted into bug reports and chat. The dangerous case is indirect: a domain
error that captured a passphrase in its `Display`, wrapped with `#[from]` and
surfaced in a toast. Redact at the point of construction, before the value can
reach a formatter.

### 3. Host keys are verified

Unknown key: prompt with the fingerprint. Changed key: block, and require a
deliberate override that is not the default button. Never verify-none, never
silent trust on first use. This is the single control standing between the user
and a network attacker, and it is the one most often weakened for convenience.

### 4. Key material is zeroized

Decrypted private keys and passphrases are wrapped in `zeroize` types and
dropped as soon as authentication completes. They are never written to a
temporary file, which would survive the process and land in a backup.

The promise stops where our copy does. Once the secret is handed to `russh` for
authentication its lifetime belongs to `russh` and to whatever its crypto
backend allocates, and no wrapper on our side reaches into that. `ssh/connection.rs`
has said so at the top of the file since it was written; this section had not,
and a rule that claims more than it can do is worth less than one that names its
edge. What is guaranteed is that Runic's own copy is zeroized and does not
outlive the attempt.

### 5. No telemetry without opt-in

No usage reporting, no crash reporting, no update ping, unless the user turns it
on. Connection metadata from an SSH client is a map of someone's
infrastructure.

### 6. Minimal Tauri capabilities

`tauri.conf.json` grants the webview the narrowest capability set that works.
Widening it needs an ADR, because a capability is a permanent grant to code that
renders hostile input.

## Handling untrusted remote output

* Terminal output goes to `xterm.js` as data. It is never interpolated into
  HTML, never passed to `dangerouslySetInnerHTML`, and never evaluated.
* SFTP filenames are treated as hostile: no path traversal on download, no
  control characters rendered raw in the file list, length capped.
* Protocol-level limits are enforced by the core. A remote host must not be able
  to exhaust memory by announcing an enormous directory or an enormous packet.

## What the clipboard carries

Copying from the terminal puts terminal contents on the system clipboard, where
adversary 3 can read them. That is the asset row above, moved somewhere less
protected, by the person at the keyboard. It is user-initiated egress and the
alternative is a terminal nobody can work in, so it is allowed and written down
rather than allowed quietly.

The application itself neither reads nor writes the clipboard. Copy and paste
run on the browser's own clipboard events, raised by a keystroke, so no
capability grants us access to it at any other moment. ADR-0018 records why the
plugin that would have granted that access was refused.

Pasting is the sharper edge. A shell runs each line of a paste as it arrives, so
text carrying a line break executes without anybody pressing Return. Bracketed
paste closes this and `xterm.js` applies it whenever the remote shell asks;
where it is absent, a multi-line paste is shown to the user before it is sent.

## What a chain carries

A saved host can name another saved host as the machine it is reached through.
That is two connections and two authentications where there was one, and the
whole security content of it is in the order, which lives in the core and not in
the interface (ADR-0023).

The bastion's key is verified, the bastion is authenticated, a channel is opened
through it, and only then is the far host's key verified and its credential
used. Rule 3 applies at **both** hops, and the machine that fronts the others is
not the one to make an exception for.

**The far host's credential never reaches the bastion.** The far session is an
ordinary connection whose transport happens to be a channel: its key exchange
and its authentication run end to end with the far host, so the bastion forwards
ciphertext it cannot read. That is the property the `ssh -A` pattern this
replaces does not have, and it is the reason a chain is worth building rather
than shelling out to an agent.

Two prompts can arrive in a row for two different machines, and to anybody not
told which is which they are the same screen shown twice: the second gets
answered on the strength of having thought about the first. So every screen in a
chain says which hop it is about, the host key prompt and the credential window
alike. ADR-0023 attached that condition to allowing a bastion to prompt at all,
and ADR-0027 kept it when the bastion was allowed to ask.

A bastion is shared: a chain rides a connection that is already open rather than
opening a second one, and it stays up until the last session on it leaves
(ADR-0024). That makes the connection outlive the thing that opened it, which is
correct and is also why it has to be visible. An open authenticated session on a
bastion is a live credential in use, and a client that holds one without saying
so is asking the user to reason about something it has hidden. The host's row
says it is carrying, and the status bar of the session riding it names the
machine it travels through.

The sharing is narrower than it should be, and the gap is #200: a bastion the
chain opens itself is not registered, so a second chain to the same host opens
another connection to it. That costs a bastion's log and its `MaxSessions` more
than it should. It does not widen what anything can read.

## What synchronised typing carries

The main area can be divided, and typing can be sent to every group at once. It
is the only control here whose reach is larger than the host being looked at, so
it is off by default, it disarms itself whenever the set of groups changes, and
while it is armed every receiving group carries a warning edge and the status bar
carries a button that turns it off. Individual groups can be spared from the tab
that would receive, which is what a receiving group's edge is saying and a spared
one's is not. Nothing is remembered between runs, and arming always starts with
every group receiving rather than inheriting a set narrowed for other hosts.

The danger it cannot close is a password. Anything typed at a `sudo` prompt
reaches every group, where the hosts that were not asking for it echo it to
their screens and may keep it in their shell history. **A password prompt cannot be
detected from here.** The remote pty turns the echo off on the far side of the
channel; what arrives is a byte stream with nothing in it to key on. There is no
mitigation beyond the switch being loud and off by default, and saying so is
better than implying a check exists.

For the same reason every paste is shown first while the switch is armed, one
line and bracketed pastes included. The paragraph above is about the shell
running a line; this is about the paste reaching four production machines
because the wrong group had focus, which no protocol feature closes. ADR-0019
records both, and why per-group opt-in was refused: a subset the user has to
check one rectangle at a time is harder to see than a rule that spans all of
them.

## Reviewing a change

Any change touching `vault/`, host key verification, logging, or
`tauri.conf.json` capabilities requires a proposal and an ADR before
implementation, and a second read of this document during review. The bar is not
"does it work" but "what does it hand to a hostile host".
