# ADR-0011: Drop the WebGL renderer and paint with the DOM one

* **Status**: Accepted
* **Date**: 2026-08-22, proposed. 2026-08-23, decided.
* **Supersedes**: [ADR-0006](0006-render-the-terminal-with-webgl.md)

## Context

ADR-0006 chose the `xterm.js` WebGL addon over the built-in DOM renderer. It
was explicit about the price: one runtime dependency, a fallback path, two sets
of glyph-level rendering bugs, a GPU driver bug becoming our bug report, and
the admission that "fast" is a promise kept on Windows and macOS and not
guaranteed on every Linux configuration.

It was equally explicit that the price was conditional. Its follow-up said to
measure throughput on all three platforms "since this decision is only
justified if the difference is real", and the ADR was accepted with that
measurement outstanding.

The measurement now exists, in
[`docs/measurements/terminal-throughput.md`](../measurements/terminal-throughput.md).

**The renderers, four runs on an RTX 5070 under Chromium 151, the engine
WebView2 embeds:**

| | DOM | WebGL | Ratio |
| --- | --- | --- | --- |
| Best | 102.5 MB/s | 104.9 MB/s | 1.02x |
| Worst | 95.9 MB/s | 102.1 MB/s | 1.09x |

WebGL is between one and nine percent faster. The gap between them is smaller
than the DOM renderer's own run-to-run variance.

**And the number that actually decides it:**

| | |
| --- | --- |
| What the transport delivers | 9.1 – 15.2 MB/s |
| What either renderer draws | 96 – 105 MB/s |

The transport is bounded by design: a 256 KiB buffer flushed at most every
16 ms, which is what keeps a hostile host from swamping the IPC channel
(ADR-0003's threat model, issue #23). Both renderers draw six to ten times
faster than output can arrive.

The renderer is not the bottleneck. It was never going to be.

## Options considered

### Option A: Keep ADR-0006

The measurement is one machine, one GPU, one engine. A weak or integrated GPU
might widen the gap, and holding the decision until more machines report is
defensible.

It is also how a dependency survives a measurement that did not justify it. The
gap would have to widen by an order of magnitude to matter, because the
renderer would still need to become slower than 15 MB/s before a user could
tell, and the DOM renderer is six times above that on the machine measured.
Keeping the addon on the possibility means keeping the dependency, the bundle,
the fallback path and the two-renderer bug surface for a case nobody has
observed.

### Option B: Drop the WebGL addon

Remove `@xterm/addon-webgl`. The DOM renderer is the only renderer, on every
platform, with no fallback because there is nothing to fall back from.

This gives up a measured one to nine percent, and gives up headroom that would
matter if the transport bound were ever raised far above where it is. It also
removes the ability to say "we use the fast renderer", which is a real thing to
give up in a product whose pitch is speed, and an honest reason to name,
because it is about how the product sounds rather than how it performs.

### Option C: Keep the addon, default to DOM

Ship both and let a setting choose.

The worst of both: the dependency stays, the bundle stays, both rendering paths
stay supported and testable, and a setting is added that almost nobody should
change. Optionality has a cost, and here it buys the appearance of caution.

## Deferred on 2026-08-22

The maintainer chose to decide this against a packaged build rather than
against a development server, and the reason is sound: the measurement above
was taken in Edge, and while WebView2 embeds the same Chromium engine, a
packaged application is not a browser tab. Two cases this record is least sure
about, integrated graphics and a large terminal on a high-density display,
are also better answered on the machines people actually use than on the one
that happened to be nearby.

The cost of deferring is stated plainly, because it is not zero. The
dependency, the 110 KB, the two rendering paths and the context-loss path all
stay maintained until then. And the first packaged build is #40, the last issue
in v0.1.0, which means this decision lands at the point of least appetite for
removing anything. That is a real risk of the deferral, not an argument
against it, and the mitigation is that #40 carries the measurement as a
release-blocking item rather than leaving it to be remembered.

## Decided on 2026-08-23

The measurement the deferral was waiting for now exists, in
[`terminal-throughput.md`](../measurements/terminal-throughput.md). It was taken
in the application's own webview, WebKitGTK rather than a browser tab, which is
what
the deferral asked for.

| | DOM | WebGL | Ratio |
| --- | --- | --- | --- |
| Windows 11, RTX 5070, Chromium | 95.9 – 102.5 MB/s | 102.1 – 104.9 MB/s | 1.01 – 1.09x |
| Linux, WebKitGTK, software rasteriser | 88.2 – 108.8 MB/s | 67.1 – 80.2 MB/s | **0.71 – 0.81x** |

**On the weaker configuration the addon is not merely not faster. It is 19 to 29
percent slower.** And the row with the worst ratio is a 3800×2100 window on a
3840×2160 display, the large terminal on a high-density screen this decision
named as one of the two cases it was least sure about.

That is the opposite of what a deferral protects against. The reason to wait was
that a weak GPU might reveal the addon earning its keep; the weakest
configuration reachable reveals it costing.

**What is still not measured**, stated plainly because the numbers above are one
platform: WebKitGTK on working hardware, and macOS under WKWebView on anything.
Every EGL path on the machine that took these numbers falls back to software.
the failures are recorded in the measurement document. Neither gap changes the
arithmetic below, because the transport ceiling is the same on every platform
and both renderers clear it several times over on the slowest configuration
anyone has run.

## Decision

Option B, proposed on 2026-08-22 and accepted on 2026-08-23.

Remove the WebGL addon. `xterm.js` paints with its DOM renderer.

The reason is not that WebGL is slow. It is that the thing it accelerates is
already six times faster than the fastest rate at which our own transport will
ever hand it data, and ADR-0006 conditioned itself on a difference being real.
Between one and nine percent, against a variance of six, is not the difference
that was imagined.

The tradeoff accepted is measured headroom on high-end hardware, and a claim
about the product that can no longer be made.

## Consequences

**Good**: one fewer runtime dependency to track for advisories. 110 KB out of
the bundle. One rendering path instead of two, which removes the glyph-level
divergence ADR-0006 warned about: ligatures, emoji and box-drawing characters
no longer render differently depending on what the machine could do. A GPU
driver bug stops being a Runic SSH bug report. The context-loss path, the
hardest thing here to test and the easiest to get subtly wrong, disappears
rather than being maintained.

**Good**: the promise gets simpler and truer. "The same on all three platforms"
was the argument for `russh` in ADR-0003, and this brings rendering into line
with it.

**Bad**: a measured one to nine percent is given up. Small, and real.

**Bad**: this rests on two machines and one of them could not reach its own
GPU. WebKitGTK on working hardware is unmeasured, and macOS is unmeasured
entirely. If either turns out to matter, the addon comes back, and the code to
bring it back is in this repository's history, alongside the tests that covered
its fallback, and `docs/measurements/terminal-throughput.md` says what would
have to be true for that to be the right move.

**Bad**: the headroom disappears if the transport bound is ever raised. Should
the 256 KiB ceiling or the 16 ms interval change substantially, this decision
needs measuring again rather than assuming.

**Bad**: the renderer benchmark goes with the addon. It compared two things and
there is now one, so keeping it would have meant keeping the dependency it was
built to judge. Anyone reopening this reverts the commit that removed both,
`docs/measurements/terminal-throughput.md` says so where the harness used to be
described.

**Follow-up**: measure WebKitGTK on working graphics, and macOS under WKWebView
on anything, if either platform ever reports the DOM renderer struggling. Both
are unmeasured and neither blocks v0.1.0, because the argument here is that the
transport ceiling is several times below what the slowest renderer measured
already draws. Revisit if the transport bound changes, because that is the
number this
decision actually rests on.
