/**
 * Where things sit on the map when nobody has put them anywhere, and how the
 * map is looked at.
 *
 * A component the user has dragged keeps its own position (`model.ts`); the
 * rest are placed here, around the centre of the level they are on. A ring
 * up to {@link RING_MAX}, because a ring of nine reads as a diagram and a
 * ring of twenty is a circle nobody can read; beyond that a honeycomb, so a
 * bastion with eighteen hosts behind it stays a place and not a wheel.
 *
 * The view is a translation and a scale over the whole level. Zoom keeps the
 * point under the cursor where it is, which is what makes a wheel feel like
 * leaning in rather than being moved.
 */

import type { Point } from '../../ipc';

export const RING_MAX = 8;

/** The honeycomb's spacing between neighbours, in map pixels at 100%. */
export const HONEYCOMB_STEP = 118;

/** The view: where the level's origin is on the stage, and how large it is drawn. */
export interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const HOME_VIEW: View = { x: 0, y: 0, scale: 1 };

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2;

/**
 * Below this a terminal is a thumbnail: `docs/measurements/terminal-under-zoom.md`
 * found both ways of drawing one stop being readable there, by size or by
 * wrapping. At or above it the terminal is refit 1:1, keeping the glyph the
 * user chose and giving up columns instead.
 */
export const REFIT_MIN = 0.75;

export type TerminalTreatment = 'refit' | 'thumbnail';

export function terminalTreatment(scale: number): TerminalTreatment {
  return scale >= REFIT_MIN ? 'refit' : 'thumbnail';
}

/** Positions for `count` children around `centre`, on a ring of `radius`. */
export function ringPositions(count: number, centre: Point, radius: number): readonly Point[] {
  const out: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    out.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
  }
  return out;
}

/**
 * Positions for `count` children around `centre` on concentric hexagonal
 * rings: six on the first, twelve on the second, eighteen on the third.
 */
export function honeycombPositions(count: number, centre: Point, step: number = HONEYCOMB_STEP): readonly Point[] {
  const out: Point[] = [];
  let ring = 1;
  while (out.length < count) {
    const slots = 6 * ring;
    const radius = step * ring;
    const offset = ring % 2 === 0 ? Math.PI / slots : 0;
    for (let k = 0; k < slots && out.length < count; k += 1) {
      const angle = (k / slots) * Math.PI * 2 - Math.PI / 2 + offset;
      out.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
    }
    ring += 1;
  }
  return out;
}

/**
 * Where each child goes: its own position if it has one, otherwise its slot
 * on the ring or the honeycomb, in order. The slots are computed for the
 * whole set so that moving one child does not reshuffle the others.
 */
export function placeChildren<T extends { readonly position?: Point }>(
  children: readonly T[],
  centre: Point,
  ringRadius: number,
): readonly Point[] {
  const slots =
    children.length <= RING_MAX
      ? ringPositions(children.length, centre, ringRadius)
      : honeycombPositions(children.length, centre);
  return children.map((child, i) => child.position ?? slots[i] ?? centre);
}

/** The ring's radius for a stage of this size: a third of its shorter side. */
export function ringRadiusFor(stageWidth: number, stageHeight: number): number {
  return Math.min(stageWidth, stageHeight) * 0.32;
}

/** A point on the stage, in map coordinates. */
export function toMap(view: View, stagePoint: Point): Point {
  return { x: (stagePoint.x - view.x) / view.scale, y: (stagePoint.y - view.y) / view.scale };
}

/** A point on the map, in stage coordinates. */
export function toStage(view: View, mapPoint: Point): Point {
  return { x: mapPoint.x * view.scale + view.x, y: mapPoint.y * view.scale + view.y };
}

export function pan(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/**
 * Zooms by `factor` about a point on the stage, so that what was under the
 * cursor stays under it. Clamped to `[ZOOM_MIN, ZOOM_MAX]`.
 */
export function zoomAt(view: View, stagePoint: Point, factor: number): View {
  const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.scale * factor));
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return {
    x: stagePoint.x - (stagePoint.x - view.x) * ratio,
    y: stagePoint.y - (stagePoint.y - view.y) * ratio,
    scale,
  };
}

/** A rectangle in map coordinates. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The view that shows `rect` whole, centred, with `padding` around it, at the
 * largest scale that fits, never above `ZOOM_MAX` nor below `ZOOM_MIN`.
 */
export function fitTo(rect: Rect, stageWidth: number, stageHeight: number, padding: number = 60): View {
  const width = Math.max(1, rect.right - rect.left + padding * 2);
  const height = Math.max(1, rect.bottom - rect.top + padding * 2);
  const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(stageWidth / width, stageHeight / height)));
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  return { x: stageWidth / 2 - cx * scale, y: stageHeight / 2 - cy * scale, scale };
}
