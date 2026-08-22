/**
 * What can be done to a session from the list.
 *
 * The sidebar row only ever connected. Everything else — changing the port,
 * renaming, deleting — lived behind the command palette, which is fine as a
 * second way to reach something and useless as the only one: nobody presses
 * Ctrl-Shift-P to look for a thing they have not been told exists.
 *
 * The actions are data so that what a row offers, and when, can be asserted
 * without a menu to open.
 */

import type { LiveSession } from './state';

export type SessionAction = 'connect' | 'disconnect' | 'edit' | 'delete';

export interface MenuItem {
  readonly action: SessionAction;
  /** Read aloud and shown. */
  readonly label: 'session.menu.connect' | 'session.menu.disconnect' | 'session.menu.edit' | 'session.menu.delete';
  /** Whether losing something is the outcome. Carried, not inferred. */
  readonly destructive: boolean;
}

const CONNECT: MenuItem = { action: 'connect', label: 'session.menu.connect', destructive: false };
const DISCONNECT: MenuItem = {
  action: 'disconnect',
  label: 'session.menu.disconnect',
  destructive: false,
};
const EDIT: MenuItem = { action: 'edit', label: 'session.menu.edit', destructive: false };
const DELETE: MenuItem = { action: 'delete', label: 'session.menu.delete', destructive: true };

/**
 * The menu for one row.
 *
 * A connected session offers to disconnect rather than to connect: offering
 * both is offering one that does nothing, and a menu item that does nothing is
 * how a menu stops being read.
 */
export function sessionMenu(live: LiveSession): readonly MenuItem[] {
  const open = live.handle !== null || live.kind === 'connecting';

  return [open ? DISCONNECT : CONNECT, EDIT, DELETE];
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
