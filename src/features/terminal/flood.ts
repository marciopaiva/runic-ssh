/**
 * What several terminals painting at once actually costs.
 *
 * ADR-0011 measured one terminal and said what would invalidate the answer:
 * "the headroom disappears if the transport bound is ever raised". Per session
 * it has not moved. In aggregate it has, because ADR-0019 lets four panes
 * deliver four times what one could into four DOM renderers at the same time,
 * and ADR-0020 keeps that shape. Nobody had that number, which is #123.
 *
 * Throughput is not the question here. One terminal already draws six times
 * faster than the transport can feed it, so the interesting failure is not
 * "the bytes arrive late", it is "the window stops answering". That is a main
 * thread question, so this measures the main thread: how long the longest gap
 * between animation frames gets while N terminals are being written to.
 *
 * A gap is what a person feels. At 16 ms nothing is wrong. At 100 ms a
 * keystroke looks dropped and the palette opens visibly late. The count of
 * gaps over 100 ms is the number this file exists to produce.
 *
 * Not reachable from the interface, and it does not need a keyboard: it runs
 * from a query parameter and posts its own result back, which is why #123 did
 * not in fact need a person driving a packaged build.
 */

import { Terminal } from '@xterm/xterm';

/** The size the real pump emits, so the shape of the work matches the product. */
const BATCH_BYTES = 256 * 1024;

/** Above this a gap stops being a dropped frame and becomes a stall a person sees. */
const FELT_MS = 100;

export interface FrameGaps {
  readonly samples: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly worstMs: number;
  /** Gaps long enough that a keystroke would look dropped. */
  readonly overFeltMs: number;
}

export interface FloodMeasurement {
  readonly terminals: number;
  readonly bytesEach: number;
  readonly milliseconds: number;
  readonly aggregateMbPerSecond: number;
  readonly perTerminalMbPerSecond: number;
  readonly frames: FrameGaps;
}

/**
 * Printable, varied, and free of escape sequences.
 *
 * This measures drawing rather than parsing, and a screen of one repeated
 * character lets a renderer cheat by reusing a glyph it already has.
 */
function payload(): string {
  const line = Array.from({ length: 80 }, (_, i) => String.fromCharCode(33 + ((i * 7) % 94))).join(
    '',
  );
  const repeats = Math.ceil(BATCH_BYTES / (line.length + 2));
  return `${line}\r\n`.repeat(repeats).slice(0, BATCH_BYTES);
}

/** Watches the main thread until told to stop, and reports the gaps it saw. */
function watchFrames(): { stop: () => FrameGaps } {
  const gaps: number[] = [];
  let previous = performance.now();
  let running = true;

  const tick = (): void => {
    if (!running) return;
    const now = performance.now();
    gaps.push(now - previous);
    previous = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    stop(): FrameGaps {
      running = false;
      /* The first gap is the distance from the call to the first frame, which
         is scheduling rather than work. */
      const seen = gaps.slice(1).sort((a, b) => a - b);
      if (seen.length === 0) {
        return { samples: 0, medianMs: 0, p95Ms: 0, worstMs: 0, overFeltMs: 0 };
      }
      const at = (q: number): number => seen[Math.min(seen.length - 1, Math.floor(seen.length * q))] ?? 0;
      return {
        samples: seen.length,
        medianMs: Number(at(0.5).toFixed(1)),
        p95Ms: Number(at(0.95).toFixed(1)),
        worstMs: Number((seen[seen.length - 1] ?? 0).toFixed(1)),
        overFeltMs: seen.filter((gap) => gap > FELT_MS).length,
      };
    },
  };
}

/** One terminal, opened into its own rectangle so the layout work is real too. */
function open(host: HTMLElement, columns: number, rows: number): Terminal {
  const box = document.createElement('div');
  box.style.cssText = `width:${String(columns * 9)}px;height:${String(rows * 18)}px;overflow:hidden;`;
  host.appendChild(box);

  const terminal = new Terminal({
    cols: columns,
    rows,
    scrollback: 1000,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 13,
  });
  terminal.open(box);
  return terminal;
}

/**
 * Writes `bytesEach` through each of `terminals` terminals at the same time.
 *
 * Timed to the last `write` callback rather than the last call, because `write`
 * is asynchronous and stopping the clock when the calls return would measure
 * how fast work can be queued rather than how fast it is drawn.
 *
 * The writes are interleaved deliberately: issuing all of one terminal's
 * batches before the next one's would measure four terminals in sequence,
 * which is not the thing anybody is worried about.
 */
export async function measureFlood(
  host: HTMLElement,
  terminals: number,
  bytesEach: number,
): Promise<FloodMeasurement> {
  /* A quarter of a 1440x900 window, which is what a pane gets in the 2x2. */
  const opened = Array.from({ length: terminals }, () => open(host, 96, 22));
  const chunk = payload();
  const batches = Math.ceil(bytesEach / BATCH_BYTES);

  const frames = watchFrames();
  const started = performance.now();

  await new Promise<void>((resolve) => {
    let remaining = batches * terminals;
    const done = (): void => {
      remaining -= 1;
      if (remaining === 0) resolve();
    };
    for (let batch = 0; batch < batches; batch += 1) {
      for (const terminal of opened) terminal.write(chunk, done);
    }
  });

  const milliseconds = performance.now() - started;
  const gaps = frames.stop();
  for (const terminal of opened) terminal.dispose();
  host.replaceChildren();

  const total = bytesEach * terminals;
  const perSecond = (bytes: number): number =>
    Number((bytes / 1024 / 1024 / (milliseconds / 1000)).toFixed(1));

  return {
    terminals,
    bytesEach,
    milliseconds: Number(milliseconds.toFixed(1)),
    aggregateMbPerSecond: perSecond(total),
    perTerminalMbPerSecond: perSecond(bytesEach),
    frames: gaps,
  };
}

/** The runs the question needs: one terminal, then two, then the full grid. */
export async function measureGrid(
  host: HTMLElement,
  bytesEach: number,
): Promise<readonly FloodMeasurement[]> {
  const out: FloodMeasurement[] = [];
  for (const terminals of [1, 2, 4]) {
    /* A frame of quiet between runs, so one run's queued work is not counted
       against the next one's frame gaps. */
    await new Promise((resolve) => setTimeout(resolve, 500));
    out.push(await measureFlood(host, terminals, bytesEach));
  }
  return out;
}


/**
 * The same terminals, fed at the rate the transport actually delivers.
 *
 * Flat out answers "is there headroom". This answers the question #123 asked,
 * which is different: whether the window keeps answering while four hosts
 * stream at the speed they really stream at. `ssh/terminal.rs` emits at most
 * 256 KiB every 16 ms per session, so that is what one terminal gets here.
 *
 * Duration is fixed rather than falling out of the byte count, because a run
 * that drains in 300 ms cannot say anything about a tail. Ten seconds of
 * frames is a distribution; thirteen samples is an anecdote.
 */
export async function measurePaced(
  host: HTMLElement,
  terminals: number,
  seconds: number,
): Promise<FloodMeasurement> {
  const opened = Array.from({ length: terminals }, () => open(host, 96, 22));
  const chunk = payload();

  const frames = watchFrames();
  const started = performance.now();
  let written = 0;
  let gaps: FrameGaps;

  /* The pump used to clear itself only on the branch that checks elapsed
     time. A `terminal.write` that throws mid-run never reaches that branch,
     so nothing cleared the interval or disposed the terminals it had opened:
     the timer went on firing every 16 ms, throwing again on the same
     terminals, and this function's promise never settled to say so (#208). */
  try {
    await new Promise<void>((resolve, reject) => {
      const pump = setInterval(() => {
        try {
          if (performance.now() - started >= seconds * 1000) {
            clearInterval(pump);
            resolve();
            return;
          }
          for (const terminal of opened) {
            terminal.write(chunk);
            written += BATCH_BYTES;
          }
        } catch (error) {
          clearInterval(pump);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, 16);
    });
  } finally {
    gaps = frames.stop();
    for (const terminal of opened) terminal.dispose();
    host.replaceChildren();
  }

  const milliseconds = performance.now() - started;
  const perSecond = (bytes: number): number =>
    Number((bytes / 1024 / 1024 / (milliseconds / 1000)).toFixed(1));

  return {
    terminals,
    bytesEach: Math.round(written / terminals),
    milliseconds: Number(milliseconds.toFixed(1)),
    aggregateMbPerSecond: perSecond(written),
    perTerminalMbPerSecond: perSecond(written / terminals),
    frames: gaps,
  };
}

/** Paced runs at one, two and four terminals. */
export async function measurePacedGrid(
  host: HTMLElement,
  seconds: number,
): Promise<readonly FloodMeasurement[]> {
  const out: FloodMeasurement[] = [];
  for (const terminals of [1, 2, 4]) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    out.push(await measurePaced(host, terminals, seconds));
  }
  return out;
}

export function formatFlood(runs: readonly FloodMeasurement[]): string {
  const head =
    '| terminals | MB/s total | MB/s each | median gap | p95 gap | worst gap | gaps over 100 ms |';
  const rule = '| --- | --- | --- | --- | --- | --- | --- |';
  const rows = runs.map(
    (run) =>
      `| ${String(run.terminals)} | ${String(run.aggregateMbPerSecond)} | ${String(run.perTerminalMbPerSecond)} ` +
      `| ${String(run.frames.medianMs)} ms | ${String(run.frames.p95Ms)} ms | ${String(run.frames.worstMs)} ms ` +
      `| ${String(run.frames.overFeltMs)} of ${String(run.frames.samples)} |`,
  );
  return [head, rule, ...rows].join('\n');
}
