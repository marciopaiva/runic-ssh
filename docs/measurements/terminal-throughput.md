# Terminal throughput under a flood

Measured on 2026-08-22, on GitHub's hosted runners, by
`src-tauri/tests/terminal_flood.rs::measured_throughput`. The measurement runs
on every pull request, so these numbers can be checked against the log of any
run rather than taken on trust.

## What was measured

A test SSH server writes 16 MB down a channel as fast as the flow-control
window allows. The client reads, buffers and emits batches exactly as the
application does — `src-tauri/src/ssh/terminal.rs`, unmodified.

| Platform | Throughput | Batches | Peak buffered | Times paused |
| --- | --- | --- | --- | --- |
| `macos-latest` | 15.2 MB/s | 64 (61/s) | 256 KiB | 64 |
| `ubuntu-latest` | 14.7 MB/s | 59/s | 256 KiB | 64 |
| `windows-latest` | 9.1 MB/s | 36/s | 256 KiB | 64 |

Three things are identical everywhere, because the code fixes them and the
machine does not: 64 batches for 2048 writes, a 256 KiB ceiling, and
backpressure engaging on every one of those batches.

## What the numbers say

**The bounds hold on every platform.** Memory never exceeds the ceiling, the
event rate never approaches one message per write, and nothing is dropped —
`bytes_forwarded` equals what was sent, asserted separately.

**Windows is about 40% slower.** Since the 256 KiB ceiling is reached on all
three, the limit is not the 16 ms clock: it is how long each read-buffer-emit
cycle takes. Where that time goes on Windows is not established here, and this
document will not guess — a shared hosted runner, the network stack and the
async runtime are all plausible and distinguishable only by measuring further.

It is worth keeping in proportion: 9.1 MB/s is far more than a person reads and
more than most SSH connections deliver. This is a number to know about, not a
problem to fix today.

## What these numbers do NOT establish

**They do not justify ADR-0006.** That decision chose the WebGL renderer over
the DOM one on the strength of rendering speed, and asked in its follow-up for
throughput to be measured "since this decision is only justified if the
difference is real".

What is measured here is the **transport**: the Rust side reading an SSH
channel and emitting batches. It is the same on both renderers. The comparison
that would justify ADR-0006 — WebGL against DOM, drawing — remains **entirely
unmeasured**.

The harness that answered it lived in the application itself —
`src/features/terminal/benchmark.ts`, reachable from the console during
development. It forced each renderer in turn, wrote a known volume, and timed
to the last write callback rather than to the last call, because `write` is
asynchronous and stopping the clock earlier would have measured how fast work
can be queued rather than how fast it is drawn.

**It is no longer in the tree.** It compared two renderers, and ADR-0011 left
one. Both it and the addon come back together, from the commit that removed
them, if the gaps at the end of this document ever need closing.

An earlier version of this document said the measurement needed
`@vitest/browser` or Playwright. It does not, and that framing would have bought
a dependency to measure a synthetic page rather than the product.

It deliberately does **not** run in CI. GitHub's hosted runners have no GPU, so
a comparison there would measure the DOM renderer against the DOM renderer and
report a ratio of 1.00 — which looks like a finding and is nothing at all. The
harness refuses to present that as an answer, and a test asserts the refusal.

Running it needed a machine with a working GPU. Two now have, and the results
are below.

## Reproducing

```bash
cd src-tauri
cargo test --test terminal_flood measured_throughput -- --nocapture
```

The same command runs in CI on all three platforms, so a regression shows up in
the log of the pull request that caused it.

## Measuring the renderers

The two sections below are the whole record, and the harness that produced them
was removed with the addon it existed to judge — see ADR-0011. Reproducing
either means reverting that commit first.

A measurement without the machine, the engine and the graphics path named is
not reproducible and should not be recorded as though it were. Both sections
name all three, and the second one names what it could not reach.

## Renderer comparison — Windows 11, RTX 5070

Measured on 2026-08-22, four runs, 32 MB through each renderer per run.

- **Adapter**: ANGLE (NVIDIA GeForce RTX 5070, Direct3D11)
- **Engine**: Chromium 151 (Edge), the same engine WebView2 embeds
- **Method**: page served by the WSL dev server, rendered on the Windows host so
  the measurement runs where the GPU is

| Run | DOM | WebGL | Ratio |
| --- | --- | --- | --- |
| 1 | 97.2 MB/s | 102.1 MB/s | 1.05x |
| 2 | 102.5 MB/s | 103.3 MB/s | 1.01x |
| 3 | 101.1 MB/s | 103.8 MB/s | 1.03x |
| 4 | 95.9 MB/s | 104.9 MB/s | 1.09x |

**WebGL is between 1 and 9 percent faster, on a current high-end GPU.**

### What this means for ADR-0006

Two numbers, side by side:

| | |
| --- | --- |
| What the transport delivers | 9.1 – 15.2 MB/s |
| What either renderer draws | 96 – 105 MB/s |

**The renderer is not the bottleneck and never was.** Both draw six to ten times
faster than output can arrive, and the difference between them is smaller than
the run-to-run variance of the DOM renderer alone.

ADR-0006 chose the WebGL addon over the built-in DOM renderer on the strength of
rendering speed. It accepted, in writing, a runtime dependency, 110 KB of
bundle, a fallback path, and the statement that "fast" could not be promised on
every Linux configuration. This measurement says it bought between 1 and 9
percent of a thing that was never the limit.

The ADR should be superseded rather than quietly kept. That is the outcome #67
named in advance, precisely so it would not be argued away once it arrived.

### What this does not settle

One machine, one GPU, one engine. A weak or integrated GPU might change the
ratio in either direction, and this measures **bulk write throughput**, which is
what ADR-0006 reasoned about — not smooth scrolling, not a high-DPI display, not
many small updates. Anyone reversing this decision on a different machine should
record their numbers here too.

## Renderer comparison — Linux, WebKitGTK, software rasteriser

Measured on 2026-08-23, in the application's own webview rather than in a
browser tab. That distinction is the whole reason ADR-0011 was deferred: the
numbers above were taken in Edge, and a packaged application is not a tab.

- **Engine**: WebKitGTK (reports itself as AppleWebKit 605.1.15)
- **Machine**: WSL2 on Windows 11, RTX 5070 present and unreachable — see below
- **Method**: `?benchmark=1`, 32 MB through each renderer, result posted back to
  the dev server by `vite-benchmark-plugin.ts`

| Display | Window | DOM | WebGL | Ratio |
| --- | --- | --- | --- | --- |
| Xvfb 1600×1000 | 1440×900 | 92.8 MB/s | 68.7 MB/s | 0.74x |
| WSLg, X11 backend | 1440×900 | 88.2 MB/s | 71.6 MB/s | 0.81x |
| WSLg, Wayland backend | 1440×900 | 108.8 MB/s | 80.2 MB/s | 0.74x |
| Xvfb 3840×2160 | 3800×2100 | 94.1 MB/s | 67.1 MB/s | 0.71x |

**WebGL is 19 to 29 percent slower than the DOM renderer here.** The fourth row
is the case ADR-0011 asked for by name — a large terminal on a high-density
display, where more glyphs per batch is where GPU acceleration would have the
most chance to show. It is the worst of the four.

### These are software numbers, and the reason is worth knowing

The card is an RTX 5070, and `glxinfo` reaches it: `GALLIUM_DRIVER=d3d12`
reports `D3D12 (NVIDIA GeForce RTX 5070)` on both displays. WebKitGTK still does
not, because `glxinfo` goes through GLX and the webview goes through EGL, and
every EGL path available here fails to find a device:

| Attempt | Failure on stderr |
| --- | --- |
| Xvfb, X11 | `libEGL warning: DRI3 error: Could not get DRI3 device` |
| WSLg, X11 | the same |
| WSLg, Wayland | `libEGL warning: egl: failed to create dri2 screen` |

So all four rows are a **software rasteriser**. That is the floor, not the
integrated-graphics case, and harsher than any GPU a user would actually have.
It is recorded as the floor deliberately: weak graphics is the configuration
ADR-0011 said it was least sure about, and the one where keeping the addon could
still have been justified.

**A hardware measurement under WebKitGTK remains unmeasured**, and so does
macOS under WKWebView on any hardware at all.

### The adapter string cannot be trusted here

`src/main.tsx` records `UNMASKED_RENDERER_WEBGL` beside the numbers, reasoning
that "a software rasteriser reports a real WebGL context and a meaningless
comparison". In WebKitGTK that check does not work. Every run above reported
the adapter as **`Apple GPU`** — on an NVIDIA card, on Linux. WebKit returns a
fixed string to resist fingerprinting, so it says nothing about the machine.

Read the EGL warnings on stderr instead. They are what told these runs apart.
