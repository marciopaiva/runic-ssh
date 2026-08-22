/**
 * Measuring what a renderer actually costs.
 *
 * ADR-0006 chose the WebGL addon over the DOM renderer on the strength of
 * rendering speed and never measured it. This is that measurement, and it
 * lives in the application rather than in a browser harness for two reasons:
 * a harness would have meant a dependency the project never agreed to, and it
 * would have measured a synthetic page instead of the product.
 *
 * Not reachable from the interface. It is called from the console during
 * development, on a machine with a working GPU — which excludes CI, where
 * there is none and a comparison would report a difference of zero while
 * looking like an answer.
 */

import type { Terminal } from '@xterm/xterm';

import { attachRenderer } from './renderer';
import type { RendererKind, WebglLoader } from './renderer';

export interface RendererMeasurement {
  readonly renderer: RendererKind;
  readonly bytes: number;
  readonly milliseconds: number;
  readonly megabytesPerSecond: number;
  /** How long a single batch took, on average. The number a user feels. */
  readonly millisecondsPerBatch: number;
}

/** A batch the size the real pump emits, so the shape of the work matches. */
const BATCH_BYTES = 256 * 1024;

/**
 * Writes `totalBytes` through a terminal and times it.
 *
 * Timed to the last `write` callback rather than to the last call: `write` is
 * asynchronous, and stopping the clock when the calls return would measure how
 * fast we can queue work rather than how fast it is drawn.
 */
async function timeWrites(terminal: Terminal, totalBytes: number): Promise<number> {
  /* Printable, varied, and no escape sequences: this measures drawing, not
     parsing, and a screen of one repeated character lets a renderer cheat. */
  const line = Array.from({ length: 80 }, (_, i) => String.fromCharCode(33 + ((i * 7) % 94))).join('');
  const chunk = `${(`${line}\r\n`).repeat(Math.ceil(BATCH_BYTES / (line.length + 2)))}`.slice(0, BATCH_BYTES);

  const batches = Math.ceil(totalBytes / BATCH_BYTES);
  const started = performance.now();

  await new Promise<void>((resolve) => {
    let remaining = batches;
    for (let i = 0; i < batches; i += 1) {
      terminal.write(chunk, () => {
        remaining -= 1;
        if (remaining === 0) resolve();
      });
    }
  });

  return performance.now() - started;
}

/**
 * Measures one renderer, from a terminal built for the purpose.
 *
 * The terminal is created and destroyed here so the two runs cannot influence
 * each other through a shared scrollback or a warmed glyph atlas.
 */
export async function measureRenderer(
  container: HTMLElement,
  renderer: RendererKind,
  totalBytes: number,
  load?: WebglLoader,
): Promise<RendererMeasurement> {
  const { Terminal } = await import('@xterm/xterm');

  const terminal = new Terminal({
    cols: 120,
    rows: 40,
    scrollback: 1000,
    convertEol: false,
  });
  terminal.open(container);

  const choice = await attachRenderer(terminal, undefined, load, renderer);
  if (choice.kind !== renderer) {
    choice.dispose();
    terminal.dispose();
    throw new Error(
      `asked for ${renderer} and got ${choice.kind}: ${choice.reason ?? 'no reason given'}`,
    );
  }

  try {
    const milliseconds = await timeWrites(terminal, totalBytes);
    const batches = Math.ceil(totalBytes / BATCH_BYTES);

    return {
      renderer,
      bytes: totalBytes,
      milliseconds,
      megabytesPerSecond: totalBytes / 1024 / 1024 / (milliseconds / 1000),
      millisecondsPerBatch: milliseconds / batches,
    };
  } finally {
    choice.dispose();
    terminal.dispose();
  }
}

/**
 * Measures both renderers back to back and reports the difference.
 *
 * Returns the DOM result even when WebGL is unavailable, with `webgl` absent —
 * a machine that cannot run one of them still tells you something, and
 * pretending otherwise would be worse than reporting half an answer.
 */
export async function compareRenderers(
  container: HTMLElement,
  totalBytes = 32 * 1024 * 1024,
): Promise<{
  dom: RendererMeasurement;
  webgl?: RendererMeasurement;
  webglUnavailable?: string;
}> {
  const dom = await measureRenderer(container, 'dom', totalBytes);

  try {
    const webgl = await measureRenderer(container, 'webgl', totalBytes);
    return { dom, webgl };
  } catch (error) {
    return {
      dom,
      webglUnavailable: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Formats a comparison for pasting into a measurements document. */
export function formatComparison(result: {
  dom: RendererMeasurement;
  webgl?: RendererMeasurement;
  webglUnavailable?: string;
}): string {
  const row = (m: RendererMeasurement): string =>
    `  ${m.renderer.padEnd(6)} ${m.megabytesPerSecond.toFixed(1).padStart(6)} MB/s   ` +
    `${m.millisecondsPerBatch.toFixed(1).padStart(6)} ms/batch`;

  const lines = [row(result.dom)];

  if (result.webgl !== undefined) {
    lines.push(row(result.webgl));
    const ratio = result.webgl.megabytesPerSecond / result.dom.megabytesPerSecond;
    lines.push(
      '',
      `  WebGL is ${ratio.toFixed(2)}x the DOM renderer here.`,
      ratio < 1.2
        ? '  That is not a difference worth a dependency — see ADR-0006 and issue #67.'
        : '  ADR-0006 is supported by this machine.',
    );
  } else {
    lines.push('', `  WebGL unavailable: ${result.webglUnavailable ?? 'unknown'}`);
    lines.push('  Only the fallback was measured; this says nothing about ADR-0006.');
  }

  return lines.join('\n');
}
