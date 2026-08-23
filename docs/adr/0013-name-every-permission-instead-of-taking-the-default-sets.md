# ADR-0013: Name every permission instead of taking the plugin default sets

* **Status**: Accepted
* **Date**: 2026-08-23

## Context

A Tauri capability grants permissions to a window, and a permission is usually
written as `core:<plugin>:default`. That name is misleading in the direction
that matters here. A plugin's `default` set is not the minimum the plugin needs
to work. It is **every command the plugin exposes**, bundled for convenience.
`core:window:default` alone is 28 commands.

Until this decision, `capabilities/default.json` held four such sets plus one
named permission. Expanded through `gen/schemas/acl-manifests.json`, that is 45
commands granted to the main window. Five of them have a caller:

| Command | Called by |
| --- | --- |
| `core:event:listen`, `core:event:unlisten` | `src/ipc/terminal.ts`, `src/ipc/chrome.ts` |
| `core:window:is_maximized` | `src/ipc/chrome.ts` |
| `core:window:internal_toggle_maximize` | Tauri's own injected `drag.js`, on a double click |
| `core:window:start_dragging` | the same script, on a drag |

The other 40 have none. `core:app:default` is unused in full, since nothing in
the tree imports `@tauri-apps/api/app`, and two of its eight entries name
commands
that the app plugin does not even register. `core:event`'s `emit` and `emit_to`
are granted in the direction we never use: the core emits, the webview listens.

That matters more here than in most applications. The main window is the
document that renders whatever a remote host sends, and `security-model.md`
asks for the narrowest set that works. 45-for-5 is not that.

Two of the five have no caller in our own tree, which is why this could not be
settled by reading. `start_dragging` and `internal_toggle_maximize` are invoked
by a script Tauri injects into the page, and ADR-0005 is what makes them
load-bearing: our own title bar is a drag region, and a double click on it is
expected to maximise. Nothing in this repository mentions either command.

## Options considered

### Option A: drop the sets with no caller at all

Remove `core:app:default`, and reduce `core:webview:default` to the one command
in it that is reached. Keep `core:window:default` and `core:event:default`.

Cheap, needs no verification because nothing that is used changes, and it lands
30
commands where 5 are wanted. It answers half of issue #39's "anything unused is
removed" and leaves the half that is 26 commands wide, in the plugin whose
surface reaches the window itself.

### Option B: name each permission the application actually reaches

List commands rather than sets, and let the file say exactly what the window may
do. Six lines, one per command.

The cost is coupling: the capability now depends on Tauri's command names rather
than on its curated sets. That cost is smaller than it looks, and the difference
was measured rather than assumed; see the Decision. It also means any future
use of `@tauri-apps/api` fails with an ACL denial until someone edits this file:
the mechanism working as intended, but friction that a `default` set would have
absorbed.

### Option C: Option B, with devtools granted only in debug builds

`core:webview:allow-internal-toggle-devtools` is what Tauri's injected
`toggle-devtools.js` calls on Ctrl+Shift+I. It could move to its own capability
file, loaded through `Manager::add_capability` under `#[cfg(debug_assertions)]`,
so a shipped build has no trace of it.

Rejected on a fact that has to be checked rather than assumed: the command is
`#[cfg(any(debug_assertions, feature = "devtools"))]` at both its definition and
its handler registration, so **a release build does not contain it**. The
permission is already inert once packaged. Option C would add a runtime path for
assembling the ACL, and loosen a test that currently pins the capability files
to exactly two, in order to remove a grant that has nothing to grant. It buys a
second place for permissions to enter, which is the thing worth not having.

## Decision

Option B. `capabilities/default.json` names six commands and no sets.

The tradeoff accepted is the coupling: this file now has to be maintained
against Tauri's command names.

The first draft of this ADR argued that an upstream rename would surface as a
control that quietly stopped working. That was checked before it was recorded,
and it is wrong. Renaming one permission to `core:window:allow-internal-toggle-maximiz`
and building gives:

```
error: failed to run custom build command for `runic-ssh`
Permission core:window:allow-internal-toggle-maximiz not found, expected one of ...
```

Tauri's build script validates every identifier against the resolved ACL, so a
rename is a build failure on every platform in CI, not a silent regression. The
coupling is real but it is loud, which is most of what made it worth worrying
about.

Devtools stay as a named line rather than moving to a debug-only capability,
because the command they name does not exist in a packaged build.

## Consequences

**Good**: the main window holds 6 command grants instead of 45. The capability
file is now a readable list of what the webview may do, rather than four names
that have to be expanded through the generated ACL manifest before anyone can
tell. Issue #39's second half is closed with the first.

**Bad**: three of the six permissions exist for scripts we do not write and
cannot grep for, so their justification lives only in this ADR and in the
comment above `ALLOWED` in `tests/capabilities.rs`. Delete either and the next
person reading `allow-internal-toggle-maximize` has no way to learn what calls
it. A future `@tauri-apps/api` call fails at runtime, not at compile time; only
a wrong permission *name* fails at build time.

**Bad, and unresolved**: two of the six could not be exercised. Neither a
double click on the title bar nor Ctrl+Shift+I reaches its handler under
synthetic input. `xdotool` on Xvfb and on WSLg both failed, and a control run
with all 45 commands granted failed the same way, which is what proves the
cause is the input synthesis and not the ACL. So `allow-internal-toggle-maximize`
and `allow-internal-toggle-devtools` are held here on the strength of reading
Tauri's `drag.js` and `toggle-devtools.js`, which is the weaker standard this
repository has been trying to stop relying on. They are kept rather than dropped
because dropping them breaks a real user's double click and the dev loop's
inspector, and neither failure would be visible to us.

**Follow-up**: on a Tauri upgrade, re-run the five checks in `docs/testing.md`
under "Verifying the capability set", because no test in this repository covers
the three commands that Tauri's own scripts invoke. Revisit this decision if
Tauri ever publishes minimal sets alongside the `default` ones.
