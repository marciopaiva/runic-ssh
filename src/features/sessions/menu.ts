/**
 * What can be done to a session from the list.
 *
 * The row only ever connects or disconnects now. Changing the port,
 * renaming, deleting: all of it moved to Home's Hosts section with the rest
 * of the record-keeping ADR-0029 pulled out of this workspace, on the
 * argument that a list for driving a connection and a list for editing the
 * record behind it are two different tasks wearing one row.
 *
 * The actions are data so that what a row offers, and when, can be asserted
 * without a menu to open.
 */

import type { LiveSession } from './state';

export type SessionAction = 'connect' | 'disconnect';

export interface MenuItem {
  readonly action: SessionAction;
  /** Read aloud and shown. */
  readonly label: 'session.menu.connect' | 'session.menu.disconnect';
  /** Whether losing something is the outcome. Carried, not inferred. */
  readonly destructive: boolean;
}

const CONNECT: MenuItem = { action: 'connect', label: 'session.menu.connect', destructive: false };
const DISCONNECT: MenuItem = {
  action: 'disconnect',
  label: 'session.menu.disconnect',
  destructive: false,
};

/**
 * The menu for one row.
 *
 * A connected session offers to disconnect rather than to connect: offering
 * both is offering one that does nothing, and a menu item that does nothing is
 * how a menu stops being read.
 */
export function sessionMenu(live: LiveSession): readonly MenuItem[] {
  const open = live.handle !== null || live.kind === 'connecting';

  return [open ? DISCONNECT : CONNECT];
}

/**
 * Keeps a menu on screen.
 *
 * A row near the bottom of a tall sidebar opens a menu that would run past the
 * window, and a menu whose last item is off screen hides the one that deletes.
 */
export function menuPosition(
  at: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  return {
    x: Math.max(4, Math.min(at.x, viewport.width - size.width - 4)),
    y: Math.max(4, Math.min(at.y, viewport.height - size.height - 4)),
  };
}
