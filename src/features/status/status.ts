/**
 * What the status bar says, as data.
 *
 * The bar reports four things that are true and one that is a hint. Keeping
 * the derivation here means each of them can be asserted without a window: how
 * a latency reading is graded, when the client is allowed to probe the host,
 * and what happens to the numbers when a session goes away.
 *
 * Nothing here describes *what* was transferred, only how much. That is
 * deliberate, and section 7.2 is the reason — see `commands/terminal.rs`.
 */

import type { CommandModifier, SessionStats } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

/**
 * How good a round trip is.
 *
 * Graded rather than shown raw, for the same reason the sidebar markers have
 * shapes: a number in milliseconds means something to a network engineer and
 * nothing to everyone else, and colour alone cannot carry it.
 */
export type LatencyGrade = 'good' | 'fair' | 'poor' | 'unknown';

export interface LatencyReading {
  readonly grade: LatencyGrade;
  /** How many bars are filled, out of three. Reads without colour. */
  readonly bars: number;
  readonly tone: string;
  readonly label: ParameterlessKey;
}

/**
 * The thresholds.
 *
 * 50 ms is roughly the point at which typing stops feeling local; 150 ms is
 * where a full screen redraw becomes something you watch happen. Both are
 * about what a person notices, not about what a network is proud of.
 */
const GOOD_BELOW_MS = 50;
const FAIR_BELOW_MS = 150;

const READINGS: Readonly<Record<LatencyGrade, LatencyReading>> = {
  good: { grade: 'good', bars: 3, tone: 'text-ok', label: 'status.latency.good' },
  fair: { grade: 'fair', bars: 2, tone: 'text-warn', label: 'status.latency.fair' },
  poor: { grade: 'poor', bars: 1, tone: 'text-danger', label: 'status.latency.poor' },
  unknown: {
    grade: 'unknown',
    bars: 0,
    tone: 'text-ink-disabled',
    label: 'status.latency.unknown',
  },
};

export function gradeLatency(milliseconds: number | null): LatencyReading {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds < 0) {
    return READINGS.unknown;
  }

  if (milliseconds < GOOD_BELOW_MS) return READINGS.good;
  if (milliseconds < FAIR_BELOW_MS) return READINGS.fair;
  return READINGS.poor;
}

export const ALL_LATENCY_READINGS: readonly LatencyReading[] = Object.values(READINGS);

/**
 * Whether to ask the host how long it takes to answer.
 *
 * A probe is a request the host has to reply to, which is traffic, and traffic
 * resets an idle timeout. Polling forever would keep every session alive for
 * as long as the application is running — something the user never asked for.
 * So the probe stops when the window is not being looked at, which is also
 * when nobody could read the answer.
 */
export function shouldProbe(visible: boolean, handle: number | null): boolean {
  return visible && handle !== null;
}

/** How often to probe while the bar is being looked at. */
export const PROBE_INTERVAL_MS = 5000;

/**
 * The numbers a session with no shell reports.
 *
 * Zeroes rather than blanks: a session that has moved nothing has moved
 * nothing, and an empty slot reads as a bar that is still loading.
 */
export const NO_STATS: SessionStats = {
  fromHost: 0,
  toHost: 0,
  latencyMs: null,
};

/**
 * The keys the palette hint shows.
 *
 * macOS writes modifiers as glyphs with no separator; everywhere else spells
 * them out. Getting this wrong is worse than omitting the hint — a Mac user
 * pressing Ctrl-Shift-P gets nothing at all.
 */
export function paletteKeys(modifier: CommandModifier): readonly string[] {
  return modifier === 'meta' ? ['⌘', '⇧', 'P'] : ['Ctrl', '⇧', 'P'];
}

/**
 * The terminal type requested for the remote pty.
 *
 * Pinned against `ssh/connection.rs` by a test rather than sent over IPC: it
 * is a constant on both sides, and a value that never changes does not need a
 * round trip to be read — it needs something that fails when one side changes
 * it and the other does not.
 */
export const TERM = 'xterm-256color';

/**
 * How the terminal decodes what arrives.
 *
 * Not a setting. Output crosses as bytes and `xterm.js` decodes UTF-8; this
 * says so rather than offering a choice the client does not have.
 */
export const ENCODING = 'UTF-8';
