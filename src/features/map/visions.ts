/**
 * The vision: a named set of components that lays itself out (ADR-0067).
 *
 * Two frames of reference meet here, and this module is the only place they
 * are converted. A component's `position` is absolute on the map until it
 * joins a vision; from then on it is measured from the vision's own corner,
 * and its presence is the pin: a member with one stays where it was left, a
 * member without one flows in the grid. `addMember`, `removeMember` and
 * `removeVision` convert on the way across, so a window never jumps.
 *
 * Pure, like the rest of the slice: the shape for a count, the region's
 * size and where each member sits are arithmetic, and the tests in
 * `tests/map-visions.test.ts` hold them without a DOM.
 */

import type { Component, Point, Size, Vision, Workspace } from '../../ipc';
import { GRIDS, gridCount } from '../terminal/groups';
import type { StageRect } from './windows';

/** The store's own ceiling on a name (`MAX_NAME_LEN` in `config/workspace.rs`). */
export const MAX_VISION_NAME = 80;

/** A closed component's box at 100%, which is a flowing member's cell when closed. */
export const MEMBER_ICON: Size = { w: 96, h: 112 };

/** The room a region keeps around its members, and between them. */
export const REGION = { margin: 20, gap: 16, bar: 28 } as const;

export type VisionOutcome =
  | { readonly ok: true; readonly workspace: Workspace; readonly vision: Vision }
  | { readonly ok: false; readonly reason: 'name' };

function acceptableName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length === 0 || trimmed.length > MAX_VISION_NAME ? null : trimmed;
}

/** An id no vision has, by the same scheme as a component's. */
export function newVisionId(workspace: Workspace, now: number = Date.now()): string {
  const taken = new Set(workspace.visions.map((vision) => vision.id));
  for (let attempt = 0; ; attempt += 1) {
    const candidate = `v_${now.toString(36)}${attempt === 0 ? '' : `_${attempt}`}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The visions on one level of the map. */
export function visionsOn(workspace: Workspace, layer: string | null): readonly Vision[] {
  return workspace.visions.filter((vision) => (vision.layer ?? null) === layer);
}

export function findVision(workspace: Workspace, id: string): Vision | undefined {
  return workspace.visions.find((vision) => vision.id === id);
}

/** The vision a component belongs to, if any. */
export function visionOf(workspace: Workspace, componentId: string): Vision | undefined {
  return workspace.visions.find((vision) => vision.components.includes(componentId));
}

/** A new, closed, empty vision on `layer`, placed where asked or left to the map. */
export function addVision(
  workspace: Workspace,
  name: string,
  layer: string | null,
  position?: Point,
  now?: number,
): VisionOutcome {
  const trimmed = acceptableName(name);
  if (trimmed === null) return { ok: false, reason: 'name' };
  const vision: Vision = {
    id: newVisionId(workspace, now),
    name: trimmed,
    components: [],
    open: false,
    ...(layer === null ? {} : { layer }),
    ...(position === undefined ? {} : { position }),
  };
  return { ok: true, vision, workspace: { ...workspace, visions: [...workspace.visions, vision] } };
}

function replaceVision(workspace: Workspace, id: string, change: (vision: Vision) => Vision): Workspace {
  return { ...workspace, visions: workspace.visions.map((vision) => (vision.id === id ? change(vision) : vision)) };
}

function replaceComponent(workspace: Workspace, id: string, change: (component: Component) => Component): Workspace {
  return { ...workspace, components: workspace.components.map((one) => (one.id === id ? change(one) : one)) };
}

/** Renamed, trimmed; a name the store would refuse leaves the old one. */
export function renameVision(workspace: Workspace, id: string, name: string): Workspace {
  const trimmed = acceptableName(name);
  if (trimmed === null) return workspace;
  return replaceVision(workspace, id, (vision) => ({ ...vision, name: trimmed }));
}

export function setVisionOpen(workspace: Workspace, id: string, open: boolean): Workspace {
  return replaceVision(workspace, id, (vision) => (vision.open === open ? vision : { ...vision, open }));
}

/** Where the user left the vision: the members, being relative, follow. */
export function moveVision(workspace: Workspace, id: string, position: Point): Workspace {
  return replaceVision(workspace, id, (vision) => ({ ...vision, position }));
}

/** A vision's corner on the map: where it was left, or the origin until the
    stage has placed it and written that place back. */
function anchorOf(vision: Vision): Point {
  return vision.position ?? { x: 0, y: 0 };
}

/**
 * Puts a component in a vision, taking it out of any other first.
 *
 * With `at`, the member is pinned there: `at` is absolute, the map point the
 * pointer dropped it on, and is stored relative to the vision's corner.
 * Without it the member flows, and whatever absolute position it had is
 * dropped, since it would otherwise be read as a pin. A component already
 * in this vision, or one that is not on the map, leaves the map unchanged.
 */
export function addMember(workspace: Workspace, visionId: string, componentId: string, at?: Point): Workspace {
  const vision = findVision(workspace, visionId);
  const component = workspace.components.find((one) => one.id === componentId);
  if (vision === undefined || component === undefined || vision.components.includes(componentId)) return workspace;
  const anchor = anchorOf(vision);
  const left = {
    ...workspace,
    visions: workspace.visions.map((one) =>
      one.id === visionId
        ? { ...one, components: [...one.components, componentId] }
        : one.components.includes(componentId)
          ? { ...one, components: one.components.filter((member) => member !== componentId) }
          : one,
    ),
  };
  return replaceComponent(left, componentId, ({ position: _dropped, ...rest }) =>
    at === undefined ? rest : { ...rest, position: { x: at.x - anchor.x, y: at.y - anchor.y } },
  );
}

/** A member's absolute place: the vision's corner plus its pin, or nothing when it flows. */
function freed(vision: Vision, component: Component): Point | undefined {
  if (component.position === undefined) return undefined;
  const anchor = anchorOf(vision);
  return { x: anchor.x + component.position.x, y: anchor.y + component.position.y };
}

/**
 * Takes a component out of its vision, leaving it at `at` on the map, or
 * where it stood when no drop point is given: a pinned member keeps its
 * absolute place, a flowing one is left for the map to place.
 */
export function removeMember(workspace: Workspace, componentId: string, at?: Point): Workspace {
  const vision = visionOf(workspace, componentId);
  const component = workspace.components.find((one) => one.id === componentId);
  if (vision === undefined || component === undefined) return workspace;
  const position = at ?? freed(vision, component);
  const left = replaceVision(workspace, vision.id, (one) => ({
    ...one,
    components: one.components.filter((member) => member !== componentId),
  }));
  return replaceComponent(left, componentId, ({ position: _dropped, ...rest }) =>
    position === undefined ? rest : { ...rest, position },
  );
}

/**
 * Removes a vision and frees its members where they stood, or where `drops`
 * says for the ones the stage placed itself, so the map does not pile them
 * on the origin.
 */
export function removeVision(workspace: Workspace, id: string, drops: Readonly<Record<string, Point>> = {}): Workspace {
  const vision = findVision(workspace, id);
  if (vision === undefined) return workspace;
  const members = new Set(vision.components);
  return {
    ...workspace,
    visions: workspace.visions.filter((one) => one.id !== id),
    components: workspace.components.map((component) => {
      if (!members.has(component.id)) return component;
      const { position: _dropped, ...rest } = component;
      const position = drops[component.id] ?? freed(vision, component);
      return position === undefined ? rest : { ...rest, position };
    }),
  };
}

/** Columns by rows. */
export interface Shape {
  readonly columns: number;
  readonly rows: number;
}

/**
 * The shape for a count: the first of ADR-0022's grids that holds it, and
 * rows of three past nine, which ADR-0067 offers on no measurement at all.
 */
export function gridFor(count: number): Shape {
  const needed = Math.max(1, count);
  for (const grid of GRIDS) {
    if (gridCount(grid) >= needed) {
      const [columns, rows] = grid.split('x').map(Number);
      return { columns: columns ?? 1, rows: rows ?? 1 };
    }
  }
  return { columns: 3, rows: Math.ceil(needed / 3) };
}

/** What the region needs to know of a member: how big it is, and whether it was placed by hand. */
export interface MemberBox {
  readonly id: string;
  readonly size: Size;
  /** Its centre relative to the region's corner, or `null` when it flows. */
  readonly pinned: Point | null;
}

export interface RegionLayout {
  /** Each member's centre, relative to the region's top-left corner. */
  readonly centres: ReadonlyMap<string, Point>;
  /** The region, bar included. */
  readonly size: Size;
}

/**
 * Where each member sits and how large the region is, in map pixels.
 *
 * The flowing members take the shape for their own count, each column as
 * wide as its widest member and each row as tall as its tallest, so a
 * window and an icon share a grid without the icon's cell being a window's.
 * A pinned member sits where it was put, pulled inside the margin when it
 * was dropped past the corner, and the region grows to hold it. Nothing
 * here resizes the region by hand; its size is a consequence.
 */
export function layoutVision(
  members: readonly MemberBox[],
  room: { readonly margin: number; readonly gap: number; readonly bar: number } = REGION,
): RegionLayout {
  const { margin, gap, bar } = room;
  const flowing = members.filter((member) => member.pinned === null);
  const shape = gridFor(flowing.length);
  const widths: number[] = Array.from({ length: shape.columns }, () => 0);
  const heights: number[] = Array.from({ length: shape.rows }, () => 0);
  flowing.forEach((member, i) => {
    const column = i % shape.columns;
    const row = Math.floor(i / shape.columns);
    widths[column] = Math.max(widths[column] ?? 0, member.size.w);
    heights[row] = Math.max(heights[row] ?? 0, member.size.h);
  });
  if (flowing.length === 0) {
    widths[0] = MEMBER_ICON.w;
    heights[0] = MEMBER_ICON.h;
  }
  const offsets = (extents: readonly number[]): readonly number[] => {
    const out: number[] = [];
    let at = 0;
    for (const extent of extents) {
      out.push(at);
      at += extent + gap;
    }
    return out;
  };
  const columnAt = offsets(widths);
  const rowAt = offsets(heights);

  const centres = new Map<string, Point>();
  let width = margin + widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1) + margin;
  let height = bar + margin + heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1) + margin;
  flowing.forEach((member, i) => {
    const column = i % shape.columns;
    const row = Math.floor(i / shape.columns);
    centres.set(member.id, {
      x: margin + (columnAt[column] ?? 0) + (widths[column] ?? 0) / 2,
      y: bar + margin + (rowAt[row] ?? 0) + (heights[row] ?? 0) / 2,
    });
  });
  for (const member of members) {
    if (member.pinned === null) continue;
    const half = { x: member.size.w / 2, y: member.size.h / 2 };
    const centre = {
      x: Math.max(margin + half.x, member.pinned.x),
      y: Math.max(bar + margin + half.y, member.pinned.y),
    };
    centres.set(member.id, centre);
    width = Math.max(width, centre.x + half.x + margin);
    height = Math.max(height, centre.y + half.y + margin);
  }
  return { centres, size: { w: width, h: height } };
}

/**
 * A cell for each member over the whole stage, in order, under a bar of
 * `bar` pixels with `gap` between and around: the Sessions split as a state
 * of the vision. Stage pixels, so every window is 1:1 whatever the zoom.
 */
export function fullScreenFrames(
  members: readonly string[],
  stage: { readonly width: number; readonly height: number },
  room: { readonly bar: number; readonly gap: number },
): ReadonlyMap<string, StageRect> {
  const out = new Map<string, StageRect>();
  if (members.length === 0) return out;
  const { columns, rows } = gridFor(members.length);
  const width = (stage.width - (columns + 1) * room.gap) / columns;
  const height = (stage.height - room.bar - (rows + 1) * room.gap) / rows;
  members.forEach((id, i) => {
    const column = i % columns;
    const row = Math.floor(i / columns);
    out.set(id, {
      left: room.gap + column * (width + room.gap),
      top: room.bar + room.gap + row * (height + room.gap),
      width,
      height,
    });
  });
  return out;
}
