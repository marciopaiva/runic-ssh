/**
 * Offering the existing groups as Spaces, once, on the maintainer's say-so
 * (ADR-0081).
 *
 * Nothing converts silently. This only plans: it says which Spaces would be
 * made, which already exist under that name and would be reused, and which
 * hosts would move. Applying it is a separate step behind a preview, and it
 * leaves the `group` field alone, so nothing is lost by trying.
 *
 * Pure, so the plan can be asserted without a window.
 */

import type { Session, Space } from '../../ipc';

import { spaceOf } from './scope';

/** The same cap the core enforces on a Space's name. */
const MAX_NAME = 40;
/** The same cap the core enforces on how many Spaces there can be. */
const MAX_SPACES = 32;

export interface GroupImportItem {
  /** What the Space is called. The group's own name, cut to fit. */
  readonly name: string;
  /** The saved Space with that name, reused instead of made again. */
  readonly existing: string | null;
  readonly hostIds: readonly string[];
}

export interface GroupImportPlan {
  readonly items: readonly GroupImportItem[];
  /** Groups left out because the list of Spaces is full. */
  readonly omitted: readonly string[];
}

const key = (name: string): string => name.trim().toLocaleLowerCase();

/**
 * One item per group, in the order the groups first appear.
 *
 * Only hosts that are in the default Space are planned: a host somebody already
 * filed keeps the Space they chose. A group whose name matches a saved Space
 * (case aside) reuses it, so running this twice, or after a half-finished first
 * run, moves the rest and makes nothing twice.
 */
export function planGroupImport(sessions: readonly Session[], spaces: readonly Space[]): GroupImportPlan {
  const order: string[] = [];
  const hosts = new Map<string, { name: string; ids: string[] }>();

  for (const session of sessions) {
    const group = session.group?.trim() ?? '';
    if (group === '' || spaceOf(session, spaces) !== '') continue;
    const id = key(group);
    const found = hosts.get(id);
    if (found === undefined) {
      order.push(id);
      hosts.set(id, { name: [...group].slice(0, MAX_NAME).join(''), ids: [session.id] });
    } else {
      found.ids.push(session.id);
    }
  }

  const byName = new Map(spaces.map((space) => [key(space.name), space.id]));
  let room = MAX_SPACES - spaces.length;
  const items: GroupImportItem[] = [];
  const omitted: string[] = [];

  for (const id of order) {
    const entry = hosts.get(id);
    if (entry === undefined) continue;
    const existing = byName.get(key(entry.name)) ?? null;
    if (existing === null) {
      if (room <= 0) {
        omitted.push(entry.name);
        continue;
      }
      room -= 1;
    }
    items.push({ name: entry.name, existing, hostIds: entry.ids });
  }

  return { items, omitted };
}
