# ADR-0012: Act on the window through a command that takes the calling window

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

ADR-0005 turned decorations off on Windows and Linux, which made the minimise,
maximise and close buttons ours to draw. A button we draw is a `<button>` in the
webview; it does nothing until something acts on the window on its behalf.

Tauri offers two routes for that, and they differ in who holds the privilege.

The first is `@tauri-apps/api/window`, which the webview calls directly. Each
call is gated by the ACL, so the window needs `core:window:allow-minimize`,
`allow-toggle-maximize` and `allow-close` listed in its capability. That is a
**permanent grant to the document that renders whatever a remote host sends**,
which is the thing CLAUDE.md 7.6 asks to keep as narrow as possible.

The second is a command of our own. Here the fact that decides this ADR:
**application commands are not gated by the ACL at all.** Tauri's permission
system covers core and plugin commands; a command in `commands/` is reachable
from any document in the application, with whatever arguments that document
chooses. ADR-0008 relies on this from the other side: the credential window's
capability is empty precisely because it needs nothing but our own commands.

Two more things were true when this was decided, and both are consequences of
the first route rather than arguments against it in principle:

* The frontend called `void closeWindow()` and discarded the promise. A refused
  permission and an unwired button are the same observable event, and the
  application shipped with a close control that did nothing.
* Whether the grants were even correct was invisible. `capabilities/default.json`
  listed them; nothing connected the list to a control that worked.

## Options considered

### Option A: `@tauri-apps/api/window`, with the three grants

What shipped. No new IPC surface, no Rust, and the frontend reads exactly like
every Tauri example. The window's own API is the obvious place to look for
window control, so the next person finds it without being told.

The cost is the grant. Three window operations become permanently available to
the code that renders hostile output, for the lifetime of the application, to
buy three buttons in a titlebar. Nothing about a compromised or confused
renderer is contained by it, and rule 7.6 exists to keep exactly this list
short.

### Option B: A command that takes a window label

`window_action(window: String, request: WindowRequest)`. The capability loses
the three grants, because the webview is no longer the thing acting. Failures
become reportable, because the command returns a `Result` the caller cannot
discard without the type system noticing.

It also reads naturally, and it is what most codebases would write.

The cost is that it hands the reach straight back in a different shape. Since
application commands are not ACL-gated, any document could name any window.
including `credential`, whose empty capability is ADR-0008's argument that the
main webview cannot touch the window a password is typed into. The label
parameter would make that untrue while the capability file still said it was.

### Option C: A command that takes the calling window

`window_action(window: WebviewWindow<R>, request: WindowRequest)`. Tauri injects
the window that invoked the command; the caller cannot name a different one,
because there is no parameter to name it with.

Same capability reduction and same reportable failures as Option B. The cost is
that cross-window control becomes impossible rather than merely discouraged, and
the protection is structural. It rests on a parameter's absence, not on a
permission the ACL enforces.

## Decision

Option C. Accepted on 2026-08-22.

It beat Option B on the one point where they differ: Option B's safety depends
on every future caller passing its own label, and nothing checks that. Option C
removes the ability to get it wrong, which is worth more than the flexibility it
costs, because the flexibility has no use today and the mistake is silent.

It beat Option A because a permanent grant over the window, held by the document
that renders remote output, is a large standing price for three buttons, and
because Option A cannot report its own failure, which is how the close button
came to be broken without anyone noticing.

**The tradeoff accepted is that nothing in the platform enforces this.** Adding
a window-naming parameter to `window_action` restores everything Option B was
rejected for, and the ACL has nothing to check, because it never gated the
command in the first place. The capability file would still read as narrow while
being untrue.

So the decision is held by a test. `window_action_cannot_name_a_window` in
`tests/capabilities.rs`, which reads the command's own source and fails if it
takes a `String`, a `&str` or an `AppHandle`, or if it looks a window up by
label. It sits in the capability tests deliberately: it is the reason three
permissions could leave that file. Both routes were confirmed to fail it, and
the six other capability tests pass through either sabotage untouched, which is
the whole problem it exists for.

## Consequences

**Good**: `capabilities/default.json` drops three permissions, so the only
`core:window` grants left are `default` and `allow-start-dragging`, the latter
being what Tauri's own drag-region script calls. A control that cannot act now
says so, under `windowActionRefused`, instead of looking unwired, and that
line is now run by a test rather than argued for, on both sides of the IPC
boundary. ADR-0008's claim about the credential window holds against the main
webview rather than only against the ACL.

**Bad**: no window can act on another, so a future "close all windows" or a
parent closing its child needs a new command and a fresh argument for why that
one may name a target. Every click now costs an IPC round trip where it was
previously an in-process call. Irrelevant for a titlebar button, and a real
cost if this pattern is copied somewhere hot. The `window_action` command is
itself ungated, so any document, credential prompt included, can act on
*itself*; that is harmless today because closing the prompt answers its request
as dismissed, but it is not a property the ACL is enforcing.

**Bad, specifically**: the guard is a test that reads source text, so it holds
only while someone keeps it. Deleting it is easier than the edit it prevents,
and deleting it fails nothing. A permission would have been enforced by the
platform; this is enforced by the repository agreeing with itself.

**Bad, specifically**: reaching the refusal path at all cost a seam. Neither
half of it can be made to fail from outside. Tauri's `MockRuntime` returns `Ok`
from `minimize`, `maximize` and `unmaximize` unconditionally, and a real window
refuses only in states a test cannot arrange. So `window_action` delegates to
`act_on` behind a `WindowControl` trait, and the frontend's dispatcher moved out
of the hook into `features/chrome/refusal.ts`. Both are indirection bought
purely to make a failure reachable, and someone reading either will wonder why
it is not simply inline.

**Follow-up**: revisit the decision if Tauri ever gates application commands per
window, which would move the guarantee from a test of ours into the platform and
make a label worth having again.
