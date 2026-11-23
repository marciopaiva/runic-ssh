/**
 * A host group as a starting point for a fleet run (ADR-0078, ADR-0080).
 *
 * A saved host carries an optional `group`. A group names saved hosts, which is
 * not the same as live sessions: some members may not be connected. A run only
 * reaches connected sessions, so a preset says which of its members it can
 * reach and which it leaves out, instead of leaving them out silently.
 */

import type { SessionHandle } from '../../ipc/sessions';
import type { LiveSession } from '../sessions/state';

export interface GroupPreset {
  /** The group's name, which is also its identity. */
  readonly id: string;
  readonly name: string;
  /** Connected members, in saved order, once each. */
  readonly handles: readonly SessionHandle[];
  /** Names of members that are not connected, left out of the run. */
  readonly skipped: readonly string[];
}

/** The groups that hold at least one saved host, as presets, in first-seen order. */
export function groupPresets(sessions: readonly LiveSession[]): readonly GroupPreset[] {
  const order: string[] = [];
  const members = new Map<string, LiveSession[]>();

  for (const entry of sessions) {
    const group = entry.session.group?.trim();
    if (group === undefined || group === '') continue;
    const existing = members.get(group);
    if (existing === undefined) {
      order.push(group);
      members.set(group, [entry]);
    } else {
      existing.push(entry);
    }
  }

  return order.map((group) => {
    const handles: SessionHandle[] = [];
    const skipped: string[] = [];
    for (const entry of members.get(group) ?? []) {
      if (entry.handle === null) skipped.push(entry.session.name);
      else handles.push(entry.handle);
    }
    return { id: group, name: group, handles, skipped };
  });
}

/**
 * The hosts ticked when the dialog opens.
 *
 * Every target when nothing was asked for, which is how it always opened. With
 * a list from the Bar's scope, only those of them that are still targets: a
 * handle that is no longer connected cannot be sent to, and ticking it would
 * only make the count lie.
 */
export function initialSelection(
  targets: readonly { readonly handle: SessionHandle }[],
  initial: readonly SessionHandle[] | undefined,
): ReadonlySet<SessionHandle> {
  const reachable = targets.map((target) => target.handle);
  if (initial === undefined) return new Set(reachable);
  const wanted = new Set(initial);
  return new Set(reachable.filter((handle) => wanted.has(handle)));
}
