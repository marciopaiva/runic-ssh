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

---

## Several terminals painting at once

The measurement #123 asked for, taken on 2026-08-24. ADR-0011 measured one
terminal and named what would invalidate the answer: the headroom disappears if
the transport bound is raised. Per session it has not moved. In aggregate it
has, because ADR-0019 lets four panes deliver four times what one could into
four DOM renderers at the same time.

- **Machine**: WSL2 on Linux, WebKitGTK 4.1 under Xvfb, software rasteriser.
  The same conditions as the Linux renderer comparison above.
- **Engine**: `MiniBrowser` from `webkit2gtk-4.1`, which is the engine Tauri
  embeds on Linux, against the Vite dev server.
- **Harness**: `src/features/terminal/flood.ts`, run by `?flood=32` and posted
  back by `vite-benchmark-plugin.ts`.
- **Terminal size**: 96x22 each, which is what a pane gets in the 2x2 grid of a
  1440x900 window.

### Flat out, 32 MB through each terminal

| terminals | MB/s total | MB/s each | median gap | p95 gap | worst gap | gaps over 100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 104.2 | 104.2 | 17 ms | 43 ms | 43 ms | 0 of 13 |
| 2 | 104.1 | 52.0 | 30 ms | 62 ms | 62 ms | 0 of 17 |
| 4 | 125.1 | 31.3 | 53 ms | 62 ms | 62 ms | 0 of 20 |

A second run agreed: 106.3, 100.0 and 128.0 MB/s.

### Paced at the transport rate, ten seconds each

`ssh/terminal.rs` emits at most 256 KiB every 16 ms per session, so each
terminal is fed exactly that. This is the run that answers the question, and
the one the flat-out numbers cannot: a run that drains in 300 ms produces
thirteen frame samples, which is an anecdote rather than a distribution.

| terminals | MB/s total | MB/s each | median gap | p95 gap | worst gap | gaps over 100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 12.5 | 12.5 | 16 ms | 17 ms | 21 ms | 0 of 621 |
| 2 | 24.8 | 12.4 | 16 ms | 19 ms | 24 ms | 0 of 621 |
| 4 | 48.2 | 12.0 | 16 ms | 20 ms | 24 ms | 0 of 620 |

### What this says

**It holds.** With four terminals streaming at the rate the transport actually
delivers, the median gap between frames stays at 16 ms and the worst gap in 620
frames is 24 ms. Nothing approaches the 100 ms where a keystroke starts to look
dropped and the palette opens visibly late.

The headroom did shrink, and by more than the flat-out total suggests. Per
terminal, drawing falls from 104 MB/s alone to 31 MB/s with four running, so
four terminals draw 125 MB/s between them rather than 400. Against a transport
that delivers 9.1 to 15.2 MB/s per session, four sessions at full rate demand
36 to 61 MB/s:

| | one terminal | four terminals |
| --- | --- | --- |
| What the transport asks for | 9.1 – 15.2 MB/s | 36.4 – 60.8 MB/s |
| What the renderer draws | 96 – 105 MB/s | 125 MB/s |
| Headroom | about 7x | **about 2 to 3.4x** |

Seven times became two to three times. That is still headroom and it is no
longer comfortable, which is worth knowing before anything raises the per
session bound.

### What this does NOT establish

1. **It measures drawing, not the whole pipeline.** The harness writes bytes
   straight into `terminal.write()`. The real path decodes an event payload
   from the IPC bridge first, on the same thread. Whatever that costs is on top
   of these numbers, not included in them.
2. **One machine, one engine, software rasterised.** A GPU would change the
   flat-out figures and, going by the Linux comparison above, not necessarily
   upward.
3. **Panes this size.** Each terminal is 96x22. A window at 2560 wide gives
   each pane more cells, and cells are the work.
4. **Synthetic text.** Printable, varied, no escape sequences, so it measures
   drawing rather than parsing. A host emitting heavy SGR or cursor addressing
   is a different load.

---

## Six and nine, measured 2026-08-25

Taken because a 3x3 shape was proposed, and ADR-0019 said to revisit the
four-pane limit when somebody measured, and to lower it if the measurement said
so rather than raising it because nothing had broken yet.

Same harness, same machine, same software rasteriser. The four-terminal row
reproduces the run above almost exactly, which is what makes the two new rows
comparable rather than merely new.

### Paced at the rate the transport delivers

The harness feeds every terminal 12 MB/s, which is the top of what one SSH
session asks for.

| terminals | MB/s total | MB/s each | median gap | p95 gap | worst gap | over 100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 47.6 | 11.9 | 14 ms | 21 ms | 27 ms | 0 of 717 |
| 6 | 62.5 | 10.4 | 14 ms | 21 ms | 42 ms | 0 of 709 |
| 9 | 73.3 | 8.1 | 19 ms | 28 ms | 45 ms | 0 of 536 |

### Flat out, 16 MB each

| terminals | MB/s total | MB/s each | median gap | p95 gap | worst gap | over 100 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 100.8 | 25.2 | 31 ms | 60 ms | 60 ms | 0 of 19 |
| 6 | 122.3 | 20.4 | 30 ms | 40 ms | 42 ms | 0 of 25 |
| 9 | 119.2 | 13.2 | 40 ms | 59 ms | 61 ms | 0 of 30 |

### What it says

**Nothing stutters.** The worst gap anywhere is 61 ms, against the 100 ms where
a keystroke starts to look dropped. Nine terminals painting at once is not a
frame rate problem.

**The renderer stops keeping up.** Four terminals take the full 11.9 MB/s each
the pacing offers. Nine take 8.1. The ceiling is the aggregate: about 120 MB/s
flat out whatever the count, so nine sessions each wanting 9 to 15 MB/s are
asking for 81 to 137 against a 120 that does not grow.

Six sits between: 10.4 each, still ahead of the 9.1 low end of what a session
asks for, behind the 15.2 high end.

So the honest reading is that the headroom named above is spent somewhere
between six and nine terminals **all busy at once**. What that describes is
nine hosts all streaming at full tilt, which is a different activity from nine
hosts being restarted and watched. ADR-0022 decides what to do with that.

### Rows, which the renderer has nothing to say about

Each row of groups costs 48px of chrome: a 28px strip, 4px of border and 16px
of padding. Cells are 8.12 x 23.16 px.

| shape | rectangles | 1440x900 | 1920x1080 |
| --- | --- | --- | --- |
| 3x1 | 3 | 43 x 34 | 62 x 41 |
| 2x2 | 4 | 66 x 15 | 95 x 19 |
| 3x2 | 6 | 43 x 15 | 62 x 19 |
| 2x3 | 6 | 66 x 9 | 95 x 12 |
| 3x3 | 9 | 43 x 9 | 62 x 12 |

Three columns cost width, which there is enough of. Three rows cost nine lines,
and `top` wants twenty-four. That is the real limit on 3x3, and it is not one a
faster renderer would move.
