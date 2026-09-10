/**
 * How a component's window behaves, the way a window does on Windows.
 *
 * The prototype settled this against the maintainer's own reflexes: the
 * title bar drags, every edge resizes with the opposite edge standing still,
 * the top of the stage maximises and a side snaps to half. Nothing here
 * knows about the DOM; it is arithmetic over rectangles so the shell can be
 * a thin thing and the behaviour can be asserted.
 */

import type { Point, Size } from '../../ipc';

import { MIN_SIZE } from './model';

/** Which edge or corner of a window is being pulled. */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Where a window snapped to when dragged to the stage's edge. */
export type SnapSide = 'full' | 'left' | 'right';

/** How close to the stage's edge, in stage pixels, a drag has to come to snap. */
export const SNAP_MARGIN = 10;

export interface Resized {
  readonly size: Size;
  /** How far the window's centre moves, so the pulled edge follows the
      pointer and the opposite one stays put. */
  readonly centreShift: Point;
}

/**
 * The size and centre shift after pulling `handle` by `delta` (in map
 * pixels) from a window that was `start` large. The size never goes below
 * {@link MIN_SIZE}, and when it hits the floor the centre stops moving too,
 * so the opposite edge does not creep.
 */
export function resizeFrom(handle: ResizeHandle, start: Size, delta: Point, min: Size = MIN_SIZE): Resized {
  let w = start.w;
  let h = start.h;
  let dx = 0;
  let dy = 0;
  if (handle.includes('e')) {
    w = Math.max(min.w, start.w + delta.x);
    dx = (w - start.w) / 2;
  }
  if (handle.includes('w')) {
    w = Math.max(min.w, start.w - delta.x);
    dx = -(w - start.w) / 2;
  }
  if (handle.includes('s')) {
    h = Math.max(min.h, start.h + delta.y);
    dy = (h - start.h) / 2;
  }
  if (handle.includes('n')) {
    h = Math.max(min.h, start.h - delta.y);
    dy = -(h - start.h) / 2;
  }
  return { size: { w, h }, centreShift: { x: dx, y: dy } };
}

/** The cursor a handle shows, so the eight edges read as four gestures. */
export function resizeCursor(handle: ResizeHandle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

/**
 * Which side a drag that ends at `pointer` (in stage pixels) snaps to, or
 * `null` when it is not at an edge. The top edge wins over a side when the
 * pointer is in a corner, because maximising is the more common intent.
 */
export function snapZone(pointer: Point, stageWidth: number, margin: number = SNAP_MARGIN): SnapSide | null {
  if (pointer.y < margin) return 'full';
  if (pointer.x < margin) return 'left';
  if (pointer.x > stageWidth - margin) return 'right';
  return null;
}

export interface StageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The rectangle a snapped window fills, in stage pixels. */
export function snapRect(side: SnapSide, stageWidth: number, stageHeight: number): StageRect {
  switch (side) {
    case 'full':
      return { left: 0, top: 0, width: stageWidth, height: stageHeight };
    case 'left':
      return { left: 0, top: 0, width: stageWidth / 2, height: stageHeight };
    case 'right':
      return { left: stageWidth / 2, top: 0, width: stageWidth / 2, height: stageHeight };
  }
}

/**
 * The rectangle moved the least distance that puts it wholly on the stage,
 * when it fits. A window opens centred on its icon, and an icon near the
 * stage's edge would put the strip out of reach; one that is larger than
 * the stage keeps its top-left corner on it, so the strip is always there
 * to drag by. A stage still measuring zero is left alone.
 */
export function keepInside(rect: StageRect, stageWidth: number, stageHeight: number): StageRect {
  if (stageWidth <= 0 || stageHeight <= 0) return rect;
  const left = Math.max(0, Math.min(rect.left, stageWidth - rect.width));
  const top = Math.max(0, Math.min(rect.top, stageHeight - rect.height));
  return left === rect.left && top === rect.top ? rect : { ...rect, left, top };
}

/**
 * Where a line to a window ends: on its border, not its centre, along the
 * direction to `towards`. Both points and the size are in map pixels.
 */
export function edgePoint(centre: Point, size: Size, towards: Point, inset: number = 3): Point {
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const hw = size.w / 2 + inset;
  const hh = size.h / 2 + inset;
  const t = Math.min(hw / (Math.abs(ux) || 1e-9), hh / (Math.abs(uy) || 1e-9));
  return { x: centre.x + ux * t, y: centre.y + uy * t };
}

/** How far a terminal stays in from its window's sides, so the resize
    handles centred on those edges are never under it. */
export const TERMINAL_INSET = 4;

/**
 * The box a terminal is drawn in for a window body, and at what scale.
 *
 * Refit: the terminal fills the body at 1:1 and FitAddon picks the columns
 * and rows for it; zooming changes the remote pty's size, which is the
 * point of that treatment. Thumbnail: the terminal keeps the size it had at
 * 100% and is drawn through a CSS transform instead, so a zoom out never
 * sends a window change to the shell; it takes no input until zoomed back
 * in (`docs/measurements/terminal-under-zoom.md`).
 */
export interface TerminalBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** 1 for a refit terminal; the view's scale for a thumbnail. */
  readonly scale: number;
  readonly interactive: boolean;
}

export function terminalBox(body: StageRect, viewScale: number, treatment: 'refit' | 'thumbnail'): TerminalBox {
  const inset = TERMINAL_INSET;
  const left = body.left + inset;
  const top = body.top;
  const width = Math.max(0, body.width - inset * 2);
  const height = Math.max(0, body.height - inset);
  if (treatment === 'refit') return { left, top, width, height, scale: 1, interactive: true };
  return { left, top, width: width / viewScale, height: height / viewScale, scale: viewScale, interactive: false };
}
