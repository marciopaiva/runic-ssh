/**
 * What a press on the map means.
 *
 * One pointer down can end as three different things: a click, which opens;
 * a hold, which asks what to create; or a drag, which moves. The prototype
 * settled the thresholds by feel and this file makes them a decision rather
 * than a coincidence of event ordering: a press that moves past
 * {@link DRAG_THRESHOLD} is a drag and can no longer become a hold, a press
 * that lasts {@link HOLD_MS} without moving is a hold and can no longer
 * become a click, and a press released before either is a click.
 *
 * Pure, so the three outcomes can be asserted without a pointer. The shell
 * feeds it `pointerdown`, `pointermove`, a timer, and `pointerup`.
 */

import type { Point } from '../../ipc';

export const HOLD_MS = 450;
export const DRAG_THRESHOLD = 8;

export interface Press {
  readonly target: string;
  readonly origin: Point;
  readonly startedAt: number;
  readonly phase: 'pending' | 'held' | 'dragging';
}

export type PressOutcome =
  | { readonly kind: 'click'; readonly target: string }
  | { readonly kind: 'hold'; readonly target: string; readonly at: Point }
  | { readonly kind: 'drag'; readonly target: string }
  | { readonly kind: 'none' };

export function beginPress(target: string, origin: Point, now: number): Press {
  return { target, origin, startedAt: now, phase: 'pending' };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The pointer moved. A pending press that travels past the threshold becomes
 * a drag; a held press stays held (the radial menu is following the pointer,
 * not the node); a drag stays a drag.
 */
export function movePress(press: Press, at: Point): Press {
  if (press.phase === 'pending' && distance(press.origin, at) > DRAG_THRESHOLD) {
    return { ...press, phase: 'dragging' };
  }
  return press;
}

/**
 * The hold timer fired. Only a press that has not moved becomes a hold; the
 * timer is armed for every press and this is where a late one is ignored.
 */
export function holdFired(press: Press, now: number): Press {
  if (press.phase === 'pending' && now - press.startedAt >= HOLD_MS) {
    return { ...press, phase: 'held' };
  }
  return press;
}

/** The pointer came up: what the press turned out to be. */
export function releasePress(press: Press): PressOutcome {
  switch (press.phase) {
    case 'pending':
      return { kind: 'click', target: press.target };
    case 'held':
      return { kind: 'hold', target: press.target, at: press.origin };
    case 'dragging':
      return { kind: 'drag', target: press.target };
  }
}

/**
 * Which radial segment the pointer is over: `-1` inside the dead centre,
 * where releasing cancels. Segments start at twelve o'clock and run
 * clockwise, the order the options were given in.
 */
export function radialSegment(origin: Point, at: Point, options: number, deadRadius: number = 58): number {
  if (options <= 0) return -1;
  const d = distance(origin, at);
  if (d <= deadRadius) return -1;
  let angle = Math.atan2(at.y - origin.y, at.x - origin.x) + Math.PI / 2;
  if (angle < 0) angle += Math.PI * 2;
  return Math.floor((angle / (Math.PI * 2)) * options) % options;
}
