/**
 * When a command that reaches several hosts has to be held to confirm.
 *
 * A guard against a slip, not a security control (ADR-0081): it changes what
 * the interface asks before a command goes out, and the core enforces nothing
 * with it. A single-host terminal is never slowed.
 *
 * Pure, so the rule can be asserted without a window.
 */

import type { Session, Space } from '../../ipc';

import { spaceOf } from './scope';

/** How long the button is held. Long enough to read the list, short enough to bear. */
export const HOLD_MS = 800;

/** The hosts among these that sit in a production Space. */
export function productionHosts(
  ids: readonly string[],
  sessions: readonly Pick<Session, 'id' | 'name' | 'space'>[],
  spaces: readonly Space[],
): readonly string[] {
  const weight = new Map(spaces.map((space) => [space.id, space.weight]));
  const wanted = new Set(ids);
  return sessions
    .filter((session) => wanted.has(session.id) && weight.get(spaceOf(session, spaces)) === 'production')
    .map((session) => session.id);
}

/** Whether a command to these hosts is held to confirm: two or more, any in production. */
export function needsHold(
  ids: readonly string[],
  sessions: readonly Pick<Session, 'id' | 'name' | 'space'>[],
  spaces: readonly Space[],
): boolean {
  return new Set(ids).size >= 2 && productionHosts(ids, sessions, spaces).length > 0;
}
