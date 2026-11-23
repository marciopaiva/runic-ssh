/**
 * Which Space a host is in, and what the keyboard does about it (ADR-0081).
 *
 * Pure, so the rules can be asserted without a window. The default Space is
 * the empty string: it has no record, it is what a host with no `space` is in,
 * and it is also where a host lands when the Space it named has been deleted.
 */

import type { Session, Space } from '../../ipc';

export const DEFAULT_SPACE = '';

/** The Space a host is in: its own when that is still saved, else the default. */
export function spaceOf(session: Pick<Session, 'space'>, spaces: readonly Space[]): string {
  const wanted = session.space;
  if (wanted === undefined || wanted === '') return DEFAULT_SPACE;
  return spaces.some((space) => space.id === wanted) ? wanted : DEFAULT_SPACE;
}

/** The hosts of one Space. Everything else stays saved and is only not listed. */
export function inSpace<T extends { readonly session: Pick<Session, 'space'> }>(
  hosts: readonly T[],
  active: string,
  spaces: readonly Space[],
): readonly T[] {
  return hosts.filter((host) => spaceOf(host.session, spaces) === active);
}

/** The active Space if it is still saved, otherwise the default. */
export function resolveActive(active: string, spaces: readonly Space[]): string {
  return spaces.some((space) => space.id === active) ? active : DEFAULT_SPACE;
}

/** The Space a position names. Position 1 is the default Space, 2 the first saved. */
export function spaceAtPosition(position: number, spaces: readonly Space[]): string | undefined {
  if (position === 1) return DEFAULT_SPACE;
  return spaces[position - 2]?.id;
}

/**
 * The position (1 to 9) a keystroke names, or `null`.
 *
 * Ctrl+1 to 9, and Cmd+1 to 9 on a Mac. These produce no byte a shell reads as
 * anything a person typed on purpose, which is the test `isBarShortcut` applies.
 */
export function spacePosition(
  event: Pick<KeyboardEvent, 'type' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>,
  mac: boolean,
): number | null {
  if (event.type !== 'keydown' || event.shiftKey || event.altKey) return null;
  if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return null;
  const match = /^Digit([1-9])$/.exec(event.code);
  return match?.[1] === undefined ? null : Number(match[1]);
}
