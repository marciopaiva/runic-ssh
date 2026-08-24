# ADR-0018: Copy and paste through the browser's own clipboard events

* **Status**: Accepted
* **Date**: 2026-08-23

## Context

v0.1.0 shipped a terminal nobody can copy out of or paste into. The milestone
that describes it promises a real terminal, and for anybody who runs one all day
this is the first thing they hit. It was found by using the application, not by
the suite, which was green.

Three facts constrain the answer.

**Ctrl-C already means something.** It is how a person stops a process that is
filling their screen. `src-tauri/src/ssh/terminal.rs` keeps the input path alive
while the output buffer is full for that keystroke alone, and
`src-tauri/tests/terminal_flood.rs` asserts that `0x03` reaches the host under a
flood. Any binding that copies on Ctrl-C is spending that guarantee.

**The webview is the hostile surface.** `docs/security-model.md` names a
malicious remote host as the adversary we are most exposed to, and the main
window is the document that renders whatever that host sends. Rule 6 asks for
the narrowest capability set that works, and ADR-0013 already refused plugin
`default` sets on exactly this ground.

**xterm.js already does the work.** `Clipboard.ts` in `@xterm/xterm` registers a
`copy` handler that fills the clipboard from the selection and a `paste` handler
that normalises line endings and applies bracketed paste. Both are wired up in
`CoreBrowserTerminal.ts`. What stops them from running is that xterm turns
Ctrl-C into `0x03` and Ctrl-V into `0x16` and then calls `preventDefault`, so the
browser never raises the clipboard event.

## Options considered

### Option A: the clipboard plugin

Add `tauri-plugin-clipboard-manager`, grant `clipboard-manager:read-text` and
`clipboard-manager:write-text` to the main window, and call them from the key
handler.

Works everywhere and reads the clipboard on demand, which makes a context menu
entry and a command palette entry easy to add later.

The cost is the grant. `readText` is the ability to read the system clipboard
with no gesture from the user, held permanently by the document that renders
hostile output. A person who copies a password from their password manager and
then looks at a terminal has put that password within reach of any bug in the
rendering path. It also adds a runtime dependency to both the crate and the npm
package, and a third file under `capabilities/`, which the guard in
`src-tauri/tests/capabilities.rs` refuses on its own.

### Option B: the browser's own clipboard events

Call `attachCustomKeyEventHandler` and return `false` for the combinations that
mean the clipboard. xterm returns from its key handler before `preventDefault`,
the browser raises the ordinary `copy` or `paste` event, and the handlers xterm
already registers do the rest.

No dependency, no capability, no Rust change. The application never reads or
writes the clipboard: the person pressing the key does, which is why no
permission is involved. Bracketed paste comes along for free because xterm was
already applying it.

The cost is that it only works where the browser raises those events, so it
follows a keystroke and cannot be offered as a menu item that pastes on click.
It also depends on internals of a dependency staying as they are, in the sense
that an xterm release which cancelled these combinations would take the feature
with it.

### Option C: Ctrl-Shift-C and Ctrl-Shift-V only

Leave Ctrl-C alone entirely and document the GNOME Terminal convention.

Free, and safe by construction. It also appears to work already, since xterm
produces no key for those combinations and therefore never cancels them.

It is not what people ask for. The maintainer asked for Ctrl-C and Ctrl-V by
name, and a convention that has to be taught is a convention most people never
find.

## Decision

Option B, with the shortcut set from Option C kept as the always-available way
out.

Ctrl-C copies when there is a selection and interrupts when there is not.
Ctrl-V pastes. Ctrl-Shift-C and Ctrl-Shift-V always mean the clipboard whatever
is on screen. On macOS the command key does the clipboard and Ctrl-C is left
alone, because there the two keys were never the same key.

The tradeoff accepted is that a selection left on screen costs one Ctrl-C. The
selection is dropped the moment it is copied and the moment anything else is
typed, so the second press interrupts. Clearing the selection whenever the host
writes would remove even that, and was rejected: it would make text
unselectable on any screen that is updating, and reading a log as it scrolls is
an ordinary thing to do here.

A multi-line paste that the remote shell has not bracketed is shown before it is
sent, because a shell runs each line as it arrives.

## Consequences

**Good**: no new dependency and no new permission, in a project whose argument
is being small and auditable. The capability set stays at the six entries
ADR-0013 settled on. Bracketed paste, line ending normalisation and the
selection model all come from code that was already shipping. The decision about
what a keystroke means is a pure function and is asserted without rendering a
terminal.

**Bad**: copying moves terminal contents to the system clipboard, where any
local process can read them. `docs/security-model.md` lists terminal contents as
an asset that frequently holds tokens and customer data, and names an unprivileged
local process as adversary 3. This is deliberate egress asked for by the person
at the keyboard, and the alternative is a terminal nobody can work in, but it is
egress and it is written here rather than left implicit.

The confirmation surface renders the pasted text on screen and holds it in React
state while it asks. It is reached only by multi-line pastes, so a password is
never routed through it, and none of it is logged. It is still one more place
clipboard contents exist.

Ctrl-C is no longer unconditionally an interrupt in the frontend. The backend
guarantee is untouched and `terminal_flood.rs` still holds, but the sentence
"Ctrl-C always interrupts" is now false at the top of the stack, and anybody
reading the backend comment alone would be misled. That comment now says so.

**Follow-up**: a context menu on the terminal with copy and paste, since a
shortcut nobody discovers is half a feature and this repository's own sidebar
comment argues the point. Revisit if an xterm release starts cancelling
Ctrl-Shift-C or Ctrl-Shift-V, or if the one lost Ctrl-C turns out to bite in
practice, in which case the setting this ADR declined to add becomes worth its
cost.
