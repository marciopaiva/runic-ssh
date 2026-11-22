/**
 * Grouping a fleet run's answers (ADR-0078).
 *
 * Pure, and byte for byte on purpose: two hosts are in one group only when
 * exit status, stdout, stderr and both flags are identical. Normalising host
 * names or timestamps would hide a real difference, so none is done.
 */

import type { FleetResult } from '../../ipc/fleet';
import type { SessionHandle } from '../../ipc/sessions';

type Ran = Extract<FleetResult, { state: 'ran' }>;

export interface FleetGroup {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitStatus: number | null;
  readonly truncated: boolean;
  readonly timedOut: boolean;
  readonly handles: readonly SessionHandle[];
}

export interface FleetGrouping {
  /** Largest group first; ties keep the order their first member was asked in. */
  readonly groups: readonly FleetGroup[];
  /** Hosts that gave nothing to compare. */
  readonly failed: readonly SessionHandle[];
}

function keyOf(result: Ran): string {
  return JSON.stringify([
    result.exitStatus,
    result.stdout,
    result.stderr,
    result.truncated,
    result.timedOut,
  ]);
}

export function groupResults(results: readonly FleetResult[]): FleetGrouping {
  const byKey = new Map<string, { sample: Ran; handles: SessionHandle[] }>();
  const failed: SessionHandle[] = [];

  for (const result of results) {
    if (result.state === 'failed') {
      failed.push(result.handle);
      continue;
    }
    const key = keyOf(result);
    const group = byKey.get(key);
    if (group === undefined) {
      byKey.set(key, { sample: result, handles: [result.handle] });
    } else {
      group.handles.push(result.handle);
    }
  }

  const groups = [...byKey.values()]
    .map(({ sample, handles }) => ({
      stdout: sample.stdout,
      stderr: sample.stderr,
      exitStatus: sample.exitStatus,
      truncated: sample.truncated,
      timedOut: sample.timedOut,
      handles,
    }))
    .sort((a, b) => b.handles.length - a.handles.length);

  return { groups, failed };
}

/**
 * Makes a host's text safe to draw: every control character except newline
 * and tab becomes a visible `\xNN`, so an escape sequence sent by a host is
 * read, not obeyed (`docs/security-model.md`, "Handling untrusted remote
 * output").
 */
export function visibleText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (c) => {
    const code = c.charCodeAt(0).toString(16).padStart(2, '0');
    return `\\x${code}`;
  });
}

/** The lines of `text` that differ from the same line of `reference`, by index. */
export function differingLines(text: string, reference: string): ReadonlySet<number> {
  const mine = text.split('\n');
  const theirs = reference.split('\n');
  const differing = new Set<number>();
  for (let i = 0; i < mine.length; i += 1) {
    if (mine[i] !== theirs[i]) differing.add(i);
  }
  return differing;
}
