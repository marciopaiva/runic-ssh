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

## What synchronised typing carries

The panel can be split, and typing can be sent to every pane at once. It is the
only control here whose reach is larger than the host being looked at, so it is
off by default, it disarms itself whenever the set of panes changes, and while
it is armed every receiving pane carries a warning edge and the status bar
carries a button that turns it off. Individual panes can be spared from their
own headers, which is what a receiving pane's edge is saying and a spared one's
is not. Nothing is remembered between runs, and arming always starts with every
pane receiving rather than inheriting a set narrowed for other hosts.

The danger it cannot close is a password. Anything typed at a `sudo` prompt
reaches every pane, where the hosts that were not asking for it echo it to their
screens and may keep it in their shell history. **A password prompt cannot be
detected from here.** The remote pty turns the echo off on the far side of the
channel; what arrives is a byte stream with nothing in it to key on. There is no
mitigation beyond the switch being loud and off by default, and saying so is
better than implying a check exists.

For the same reason every paste is shown first while the switch is armed, one
line and bracketed pastes included. The paragraph above is about the shell
running a line; this is about the paste reaching four production machines
because the wrong pane had focus, which no protocol feature closes. ADR-0019
records both, and why per-pane opt-in was refused: a subset the user has to
check pane by pane is harder to see than a rule that spans all of them.

## Reviewing a change

Any change touching `vault/`, host key verification, logging, or
`tauri.conf.json` capabilities requires a proposal and an ADR before
implementation, and a second read of this document during review. The bar is not
"does it work" but "what does it hand to a hostile host".
