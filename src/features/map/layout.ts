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

/** The slot's own position on the honeycomb's concentric hexagonal rings:
    six on the first, twelve on the second, eighteen on the third. Depends
    only on the slot number, never on how many are placed overall, so a
    node keeps its cell when the count above or below it changes. */
export function honeycombSlotPosition(slot: number, centre: Point, step: number = HONEYCOMB_STEP): Point {
  let ring = 1;
  let base = 0;
  while (slot >= base + 6 * ring) {
    base += 6 * ring;
    ring += 1;
  }
  const slots = 6 * ring;
  const k = slot - base;
  const radius = step * ring;
  const offset = ring % 2 === 0 ? Math.PI / slots : 0;
  const angle = (k / slots) * Math.PI * 2 - Math.PI / 2 + offset;
  return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
}

/**
 * Positions for `count` children around `centre` on concentric hexagonal
 * rings: six on the first, twelve on the second, eighteen on the third.
 */
export function honeycombPositions(count: number, centre: Point, step: number = HONEYCOMB_STEP): readonly Point[] {
  return Array.from({ length: count }, (_, slot) => honeycombSlotPosition(slot, centre, step));
}

/** A fixed compass of `RING_MAX` points around `centre`: the slot's own
    position never depends on how many of the eight are actually occupied,
    so removing one node from the ring never moves another. */
export function ringSlotPosition(slot: number, centre: Point, radius: number): Point {
  const angle = (slot / RING_MAX) * Math.PI * 2 - Math.PI / 2;
  return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
}

/** Fills the ring's eight compass points in an order that keeps any
    partial occupancy spread out, rather than bunched on one side: slots
    fill 0, 4, 2, 6, 1, 5, 3, 7, never plain ascending order. */
const RING_FILL_ORDER: readonly number[] = [0, 4, 2, 6, 1, 5, 3, 7];

/**
 * Assigns each id in `ids` a stable slot number, remembered in `slots`
 * across calls. An id keeps the slot it already holds; a slot freed by an
 * id no longer present becomes free for the next id that needs one, taken
 * from `order` when it names one, otherwise the lowest free slot. `slots`
 * is the caller's own memory, mutated in place, normally a value that
 * lives as long as the map does: a component that leaves the ring (joining
 * a vision, say) must free only its own slot, not shift every id that
 * happened to sit after it.
 */
export function assignSlots(ids: readonly string[], slots: Map<string, number>, order: readonly number[] = []): readonly number[] {
  const present = new Set(ids);
  for (const id of slots.keys()) {
    if (!present.has(id)) slots.delete(id);
  }
  const taken = new Set(slots.values());
  return ids.map((id) => {
    const held = slots.get(id);
    if (held !== undefined) return held;
    let next = order.find((slot) => !taken.has(slot));
    if (next === undefined) {
      next = 0;
      while (taken.has(next)) next += 1;
    }
    taken.add(next);
    slots.set(id, next);
    return next;
  });
}

/**
 * Where each child goes: its own position if it has one, otherwise a slot
 * on the ring or the honeycomb, remembered by id in `slots` so a child
 * leaving the set (a component joining a vision, say) never moves a
 * sibling that stayed. Whether the set fits the ring or spills to the
 * honeycomb is decided by how many still need a slot, the pinned ones
 * costing nothing.
 */
export function placeChildren<T extends { readonly id: string; readonly position?: Point }>(
  children: readonly T[],
  centre: Point,
  ringRadius: number,
  slots: Map<string, number> = new Map(),
): readonly Point[] {
  const free = children.filter((child) => child.position === undefined);
  const onRing = free.length <= RING_MAX;
  const assigned = assignSlots(
    free.map((child) => child.id),
    slots,
    onRing ? RING_FILL_ORDER : [],
  );
  const bySlot = new Map(free.map((child, i) => [child.id, assigned[i] ?? 0]));
  return children.map((child) => {
    if (child.position !== undefined) return child.position;
    const slot = bySlot.get(child.id) ?? 0;
    return onRing ? ringSlotPosition(slot, centre, ringRadius) : honeycombSlotPosition(slot, centre);
  });
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
