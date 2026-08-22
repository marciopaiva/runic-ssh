# ADR-0002: Build on Tauri instead of Electron

* **Status**: Accepted
* **Date**: 2026-08-21

## Context

Runic SSH positions itself as the modern replacement for PuTTY and for
heavyweight clients such as MobaXterm. Two properties follow from that pitch and
constrain the shell we build on:

* **Resource cost.** Users keep an SSH client open all day, often alongside a
  dozen other tools. A client that costs several hundred megabytes of resident
  memory while idle undercuts the entire proposition.
* **Attack surface.** The client renders output from machines the user does not
  control. Whatever runtime we ship, we ship its vulnerabilities, and we are
  responsible for patching them.

We also want a modern UI. Writing native UI three times, or accepting a toolkit
whose theming fights us, was not attractive for a project whose differentiator
includes look and feel.

## Options considered

### Option A: Electron

The default choice for a cross-platform desktop app with a web UI. Enormous
ecosystem, well understood, and every problem has been solved by someone.

It bundles Chromium and Node. Idle memory starts in the hundreds of megabytes,
installers run past 100 MB, and every Chromium CVE becomes our patch
obligation. Privileged code runs in Node, where the boundary between renderer
and main is a convention that is easy to erode.

### Option B: Tauri 2.0

Uses the platform webview (WebView2, WKWebView, WebKitGTK) and a Rust core.
Installers in single-digit megabytes, idle memory a fraction of Electron's, and
the privileged side is Rust with an explicit capability system.

The cost is real: three webview engines instead of one, so rendering differs
across platforms and the Linux engine lags. The ecosystem is younger, and some
problems have no ready answer.

### Option C: Native UI per platform

Best possible resource profile and platform fidelity. Triples the UI work and
puts a consistent cross-platform experience out of reach for a small team.

## Decision

Option B, Tauri 2.0.

The deciding factor is that the privileged side is Rust with a capability system
rather than Node with a convention. For an application that holds SSH
credentials and renders hostile terminal output, a boundary the framework
enforces is worth more than the ecosystem maturity we give up.

The tradeoff accepted is webview fragmentation. We will hit rendering
differences, particularly on Linux, and we will spend time on them that an
Electron project would not.

## Consequences

**Good**: installer in single-digit megabytes and idle memory a fraction of an
Electron equivalent, which is the claim the README makes. Privileged code is
memory-safe Rust. The capability system makes the webview's reach explicit and
reviewable. Webview security patches arrive through OS updates rather than
through our release cycle.

**Bad**: three rendering engines to test against, and WebKitGTK on Linux will be
the one that hurts. A smaller ecosystem means occasionally writing what we would
otherwise install. Contributors need Rust, which narrows the pool. `xterm.js`
performance under the platform webviews is unproven for us and needs measuring
early, not late.

**Follow-up**: benchmark `xterm.js` throughput on all three platforms before
committing to it for v0.1.0. Revisit this decision only if webview
fragmentation proves to cost more than the security and footprint gains, which
would be a surprise worth documenting.
