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

The harness for it now exists in the application itself —
`src/features/terminal/benchmark.ts`, reachable from the console during
development. It forces each renderer in turn, writes a known volume, and times
to the last write callback rather than to the last call, because `write` is
asynchronous and stopping the clock earlier would measure how fast work can be
queued rather than how fast it is drawn.

An earlier version of this document said the measurement needed
`@vitest/browser` or Playwright. It does not, and that framing would have bought
a dependency to measure a synthetic page rather than the product.

It deliberately does **not** run in CI. GitHub's hosted runners have no GPU, so
a comparison there would measure the DOM renderer against the DOM renderer and
report a ratio of 1.00 — which looks like a finding and is nothing at all. The
harness refuses to present that as an answer, and a test asserts the refusal.

Running it needs a machine with a working GPU. Until someone does, ADR-0006
rests on the reputation of the two renderers rather than on anything observed.
Tracked in #67.

## Reproducing

```bash
cd src-tauri
cargo test --test terminal_flood measured_throughput -- --nocapture
```

The same command runs in CI on all three platforms, so a regression shows up in
the log of the pull request that caused it.

## Measuring the renderers

On a machine with a GPU, with the application running in development:

```js
const { compareRenderers, formatComparison } =
  await import('/src/features/terminal/index.ts');

const host = document.createElement('div');
document.body.append(host);
console.log(formatComparison(await compareRenderers(host)));
```

Paste the output into this file under a heading naming the machine and its GPU.
A measurement without that context is not reproducible, and should not be
recorded as though it were.
