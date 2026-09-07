/**
 * Reading a process list as something a screen can show.
 *
 * Pure and testable without a window: what a query matches, and which
 * column a list reads sorted by. Both are asserted here rather than
 * eyeballed in the component that draws them.
 */

import type { Process } from '../../ipc';

/** Which reading the busiest-first order is taken from. */
export type ProcessSort = 'cpu' | 'mem';

/** Case-insensitive, against the process's command line and its user. */
export function filterProcesses(processes: readonly Process[], query: string): readonly Process[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return processes;

  return processes.filter(
    (process) =>
      process.command.toLowerCase().includes(needle) || process.user.toLowerCase().includes(needle),
  );
}

/**
 * The host already sorts its reply by CPU; this only re-sorts the same list
 * for a column the maintainer clicked, so the busiest-first order picking
 * "mem" gives never depends on asking the host again.
 */
export function sortProcesses(processes: readonly Process[], by: ProcessSort): readonly Process[] {
  const key = by === 'cpu' ? 'cpuPercent' : 'memPercent';
  return [...processes].sort((a, b) => b[key] - a[key]);
}
