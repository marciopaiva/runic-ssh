/**
 * A short rolling history of one host's own readings.
 *
 * Client-side and in memory only: this exists to draw a chart over the last
 * few minutes, not to keep a record. It resets the moment the selected host
 * changes, so switching hosts never shows one host's history drawn against
 * another's numbers, and it is lost on reload or restart, on purpose. A
 * longer view (an hour, a day, a week) would mean writing these readings to
 * disk between polls, which is a storage decision of its own, not a bigger
 * version of this hook.
 */

import { useEffect, useRef, useState } from 'react';

import type { SessionHandle, SystemStats } from '../../ipc';

/** Samples kept, at `MONITOR_INTERVAL_MS` apart: five minutes of history. */
const HISTORY_CAPACITY = 20;

/** One reading, with when it was taken: a chart's x-axis needs the "when" as much as the value. */
export interface Sample {
  readonly at: number;
  readonly value: number;
}

export interface StatsHistory {
  readonly cpu: readonly Sample[];
  readonly ramPercent: readonly Sample[];
  readonly swapPercent: readonly Sample[];
  readonly diskPercent: readonly Sample[];
  /** The one-minute load average. Five and fifteen stay in `stats` itself;
   * charting only needs the most responsive of the three. */
  readonly loadAverage: readonly Sample[];
}

const EMPTY_HISTORY: StatsHistory = {
  cpu: [],
  ramPercent: [],
  swapPercent: [],
  diskPercent: [],
  loadAverage: [],
};

function append(history: readonly Sample[], value: number | null, at: number): readonly Sample[] {
  if (value === null) return history;
  return [...history, { at, value }].slice(-HISTORY_CAPACITY);
}

export function useStatsHistory(handle: SessionHandle | null, stats: SystemStats): StatsHistory {
  const [history, setHistory] = useState<StatsHistory>(EMPTY_HISTORY);
  const previousHandle = useRef(handle);

  useEffect(() => {
    if (previousHandle.current !== handle) {
      previousHandle.current = handle;
      setHistory(EMPTY_HISTORY);
    }
  }, [handle]);

  useEffect(() => {
    /* A reading with nothing measured (the first tick after a host is
       selected, or a lost probe) adds nothing rather than a gap the chart
       would have to draw around. */
    if (handle === null) return;

    const at = Date.now();

    setHistory((current) => {
      const next: StatsHistory = {
        cpu: append(current.cpu, stats.cpuPercent, at),
        ramPercent: append(
          current.ramPercent,
          stats.memory === null ? null : (stats.memory.usedKb / stats.memory.totalKb) * 100,
          at,
        ),
        swapPercent: append(
          current.swapPercent,
          /* A host with no swap configured reports `totalKb: 0`, a real
             answer rather than a missing one (see `ssh/monitor.rs`), but
             dividing by it here would chart NaN. Nothing to trend on a
             host with no swap at all, so this adds nothing for it, same
             as a lost reading would. */
          stats.swap === null || stats.swap.totalKb === 0
            ? null
            : (stats.swap.usedKb / stats.swap.totalKb) * 100,
          at,
        ),
        diskPercent: append(
          current.diskPercent,
          stats.disk === null ? null : (stats.disk.usedKb / stats.disk.totalKb) * 100,
          at,
        ),
        loadAverage: append(current.loadAverage, stats.loadAverage?.one ?? null, at),
      };

      const unchanged =
        next.cpu === current.cpu &&
        next.ramPercent === current.ramPercent &&
        next.swapPercent === current.swapPercent &&
        next.diskPercent === current.diskPercent &&
        next.loadAverage === current.loadAverage;

      return unchanged ? current : next;
    });
  }, [handle, stats]);

  return history;
}
