/**
 * The measurement harness, checked without a GPU.
 *
 * What cannot be tested here is the number itself — this machine has no
 * working GL context, and a comparison run without one reports the DOM
 * renderer against the DOM renderer. What *can* be tested is that the harness
 * refuses to report that as an answer, which is the failure mode that would
 * quietly settle ADR-0006 the wrong way.
 */

import { describe, expect, it } from 'vitest';

import { formatComparison } from '../src/features/terminal/benchmark';
import type { RendererMeasurement } from '../src/features/terminal/benchmark';

function measurement(renderer: 'dom' | 'webgl', mbPerSecond: number): RendererMeasurement {
  const bytes = 32 * 1024 * 1024;
  const milliseconds = (bytes / 1024 / 1024 / mbPerSecond) * 1000;

  return {
    renderer,
    bytes,
    milliseconds,
    megabytesPerSecond: mbPerSecond,
    millisecondsPerBatch: milliseconds / (bytes / (256 * 1024)),
  };
}

describe('reporting a comparison', () => {
  it('says plainly when WebGL is not worth its dependency', () => {
    /* The outcome #67 names in advance. If the two are within a fifth of each
       other, ADR-0006 bought a runtime dependency, 110 KB of bundle and a
       fallback path for nothing — and the report has to say so rather than
       presenting a ratio and leaving the reader to be generous. */
    const report = formatComparison({
      dom: measurement('dom', 40),
      webgl: measurement('webgl', 44),
    });

    expect(report).toContain('1.10x');
    expect(report).toContain('not a difference worth a dependency');
  });

  it('says plainly when the decision holds', () => {
    const report = formatComparison({
      dom: measurement('dom', 20),
      webgl: measurement('webgl', 90),
    });

    expect(report).toContain('4.50x');
    expect(report).toContain('ADR-0006 is supported');
  });

  it('refuses to call a GPU-less run an answer', () => {
    /* This is the important one. On a machine with no GL — CI, and this
       repository's WSL environment — a naive harness would compare the DOM
       renderer against itself and report a ratio of 1.00, which looks like a
       finding and is nothing at all. */
    const report = formatComparison({
      dom: measurement('dom', 40),
      webglUnavailable: 'asked for webgl and got dom: WebGL is unavailable',
    });

    expect(report).toContain('WebGL unavailable');
    expect(report).toContain('says nothing about ADR-0006');
    expect(report).not.toContain('x the DOM renderer');
  });
});
