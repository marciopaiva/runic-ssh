/**
 * Guards the status bar.
 *
 * Four of the five things it shows are measured, and the fifth is a constant
 * that lives in two places. These cover the derivations that decide what a
 * reader concludes: how a round trip is graded, when the client is allowed to
 * ask for one at all, and whether the terminal type shown is the one the core
 * actually requests.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ALL_LATENCY_READINGS,
  NO_STATS,
  PROBE_INTERVAL_MS,
  TERM,
  gradeLatency,
  paletteKeys,
  shouldProbe,
} from '../src/features/status';
import { createTranslator } from '../src/lib/i18n';

describe('grading a round trip', () => {
  it('calls a local network good', () => {
    expect(gradeLatency(4).grade).toBe('good');
    expect(gradeLatency(49).grade).toBe('good');
  });

  it('calls a continent away fair', () => {
    expect(gradeLatency(50).grade).toBe('fair');
    expect(gradeLatency(149).grade).toBe('fair');
  });

  it('calls anything worse poor', () => {
    expect(gradeLatency(150).grade).toBe('poor');
    expect(gradeLatency(4000).grade).toBe('poor');
  });

  it('says it does not know rather than guessing', () => {
    /* A lost probe is not a fast one. Grading `null` as good would tell the
       user the connection is healthy at the moment it stopped answering. */
    expect(gradeLatency(null).grade).toBe('unknown');
    expect(gradeLatency(Number.NaN).grade).toBe('unknown');
    expect(gradeLatency(-1).grade).toBe('unknown');
  });

  it('reads without colour', () => {
    /* Same rule as the sidebar markers: every grade differs by how many bars
       are filled, before any colour is applied. */
    const bars = ALL_LATENCY_READINGS.map((reading) => reading.bars);

    expect(new Set(bars).size).toBe(bars.length);
  });

  it('gives every grade a label of its own', () => {
    const labels = ALL_LATENCY_READINGS.map((reading) => reading.label);

    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('deciding whether to probe', () => {
  it('probes an open session that somebody is looking at', () => {
    expect(shouldProbe(true, 7)).toBe(true);
  });

  it('stops when the window is not visible', () => {
    /* A probe is traffic, and traffic resets a server's idle timeout. Polling
       a hidden window keeps sessions alive that the user never asked to keep,
       and nobody could read the answer anyway. */
    expect(shouldProbe(false, 7)).toBe(false);
  });

  it('does not probe with no session open', () => {
    expect(shouldProbe(true, null)).toBe(false);
  });

  it('probes seldom enough to be a heartbeat rather than a load', () => {
    expect(PROBE_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe('a session with nothing behind it', () => {
  it('reports zero rather than blank', () => {
    /* An empty slot reads as a bar still loading. A session that has moved
       nothing has moved nothing. */
    expect(NO_STATS.fromHost).toBe(0);
    expect(NO_STATS.toHost).toBe(0);
  });

  it('reports latency as unmeasured, not as zero', () => {
    /* Zero milliseconds would be the best reading on the scale. */
    expect(NO_STATS.latencyMs).toBeNull();
  });
});

describe('the palette hint', () => {
  it('shows the Command glyph on macOS', () => {
    /* A Mac user pressing Ctrl-Shift-P gets nothing at all, which makes a
       wrong hint worse than no hint. */
    expect(paletteKeys('meta')).toEqual(['⌘', '⇧', 'P']);
  });

  it('spells the modifier out everywhere else', () => {
    expect(paletteKeys('control')).toEqual(['Ctrl', '⇧', 'P']);
  });
});

describe('formatting through Intl', () => {
  it('writes the round trip in the locale own way', () => {
    const milliseconds = (locale: string): string =>
      createTranslator(locale).number(1240, {
        style: 'unit',
        unit: 'millisecond',
        unitDisplay: 'short',
        maximumFractionDigits: 0,
      });

    /* The decimal separator is the point: 1.240 ms in pt-BR is a thousand
       times what 1,240 ms would be read as by someone expecting a comma. */
    expect(milliseconds('en')).toContain('1,240');
    expect(milliseconds('pt-BR')).toContain('1.240');
  });

  it('writes transfer totals in the locale own way', () => {
    expect(createTranslator('en').bytes(2_400_000)).toBe('2.4 MB');
    expect(createTranslator('pt-BR').bytes(2_400_000)).toBe('2,4 MB');
  });
});

describe('the terminal type', () => {
  it('is the one the core actually asks the host for', () => {
    /* Shown rather than sent: it is a constant on both sides. What that needs
       is not a round trip but something that fails when one side changes it
       and the other does not. */
    const rust = readFileSync(
      fileURLToPath(new URL('../src-tauri/src/ssh/connection.rs', import.meta.url)),
      'utf8',
    );

    expect(rust).toContain(`"${TERM}"`);
  });
});
