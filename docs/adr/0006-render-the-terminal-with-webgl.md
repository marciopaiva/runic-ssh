# ADR-0006: Render the terminal with the xterm.js WebGL addon, falling back to DOM

* **Status**: Accepted
* **Date**: 2026-08-22

## Context

Perceived speed is the product's pitch. The moment a user judges Runic SSH is
the moment a command floods the screen: a `tail -f` on a busy log, a `yes`, a
build. If scrolling stutters there, no amount of backend correctness recovers
the impression.

`xterm.js` offers three ways to paint. The DOM renderer is built in and needs no
dependency. The canvas addon and the WebGL addon are separate npm packages, and
each is a runtime dependency, which section 5 of `CLAUDE.md` requires be raised
rather than decided locally.

The complication is that Tauri uses the system webview, so the GPU story differs
per platform. WebView2 on Windows and WKWebView on macOS have dependable WebGL2.
WebKitGTK on Linux does not always: on a machine without a GPU, inside a VM,
under an unusual driver, or on some Wayland configurations, WebGL2 is either
missing or backed by software rasterization that is slower than the DOM
renderer it was meant to beat. A WebGL context can also be lost at runtime — a
driver reset, a GPU switch on a laptop — and a terminal that goes blank at that
moment is worse than one that was never fast.

Also true: the DOM renderer keeps real text nodes, which is what screen readers
read. Whatever we pick has to leave `xterm.js`'s accessibility layer working.

## Options considered

### Option A: DOM renderer only

No new dependency, works on every webview, and the simplest thing to reason
about. Text is real DOM, so selection and assistive technology behave without
special handling.

The cost is throughput. Heavy output forces layout and paint over a large node
count, and the frame drops are visible exactly in the scenario the product is
judged on. This is the option that keeps the dependency count honest and loses
the pitch.

### Option B: WebGL addon, with the DOM renderer as fallback

`@xterm/addon-webgl` paints glyphs from a texture atlas on the GPU. It is the
fastest of the three by a wide margin under sustained output, and it is what the
terminals people compare us to use.

The cost is a runtime dependency, a fallback path when WebGL2 is unavailable,
and a context-loss handler that swaps renderers without dropping the buffer.
Two render paths means two sets of rendering bugs, and the fallback is the one
that ships silently on the machines we test least.

### Option C: Canvas addon

`@xterm/addon-canvas` sits between the two: faster than DOM, slower than WebGL,
and still a dependency. It exists mainly as the fallback for environments
without WebGL, and choosing it as the primary renderer means paying a
dependency without buying the speed that justifies one.

## Decision

Option B, accepted on 2026-08-22. The WebGL addon is the renderer, and the
built-in DOM renderer is the fallback — used when WebGL2 is unavailable at
startup, and switched to if the context is lost while running.

Deliberately not a three-step chain through the canvas addon: that would be a
second dependency to buy a fallback for a fallback, against a project whose
security model counts dependencies as attack surface. A uniform canvas-only
renderer was also weighed and rejected: it would make speed predictable on every
platform by giving up the speed that justifies a dependency at all.

This is the project's first runtime npm dependency, and section 5 of `CLAUDE.md`
is satisfied by this record rather than by asking again at install time.

The tradeoff accepted is that "fast" is a promise we keep on Windows and macOS
and cannot guarantee on every Linux configuration. The fallback is correct
everywhere; it is not fast everywhere.

## Consequences

**Good**: sustained output stays smooth on the platforms where most users will
judge the app. The renderer in use is observable, which the Appearance settings
screen already surfaces, so a user on a slow machine can see why rather than
guessing.

**Bad**: one runtime npm dependency, tracked for advisories like any other.
Two render paths mean glyph-level differences — ligatures, emoji, box-drawing
characters and custom glyph widths do not always land identically — so visual
bugs may reproduce only under one renderer. A GPU driver bug becomes a Runic SSH
bug report. The fallback path is the least-exercised code in the terminal and
will be the least-tested unless we force it in CI.

**Follow-up**: before v0.1.0, measure throughput under a flood (`yes`, a large
`cat`) on all three platforms and record the numbers, since this decision is
only justified if the difference is real. Force the DOM fallback in at least one
CI job so it does not rot. Decide the event batching interval for terminal
output in the streaming slice — batching is what protects the IPC channel, and
no renderer saves us from a hostile host sending one byte at a time. Revisit if
WebKitGTK's WebGL2 support proves unreliable enough that most Linux users land
on the fallback anyway, at which point the dependency is not earning its place.
