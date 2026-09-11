/**
 * The vision: ADR-0067's rules, asserted without a DOM.
 *
 * The one that matters most is that a member never jumps: its position is
 * relative to the vision while it belongs to one and absolute when it does
 * not, and the operations that move it across that line convert it.
 */

import { describe, expect, it } from 'vitest';

import {
  addMember,
  addVision,
  gridFor,
  fullScreenFrames,
  layoutVision,
  moveVision,
  removeMember,
  removeVision,
  renameVision,
  setVisionOpen,
  visionOf,
} from '../src/features/map';
import { EMPTY_WORKSPACE } from '../src/ipc';
import type { Component, Point, Workspace } from '../src/ipc';

function component(id: string, position?: Point): Component {
  return { id, kind: 'ssh', host: `s-${id}`, ...(position === undefined ? {} : { position }) };
}

const TWO: Workspace = { ...EMPTY_WORKSPACE, components: [component('c1', { x: 100, y: 100 }), component('c2', { x: 400, y: 100 })] };

describe('a vision', () => {
  it('is created named, closed, on the level asked, where asked', () => {
    const outcome = addVision(TWO, '  prod ', null, { x: 20, y: 30 }, 7);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.vision).toEqual({ id: 'v_7', name: 'prod', components: [], open: false, position: { x: 20, y: 30 } });
    expect(outcome.workspace.visions).toHaveLength(1);
  });

  it('refuses an empty name, and one longer than the store takes', () => {
    expect(addVision(TWO, '   ', null).ok).toBe(false);
    expect(addVision(TWO, 'x'.repeat(81), null).ok).toBe(false);
  });

  it('carries its layer only when it has one', () => {
    const outcome = addVision(TWO, 'lab', 'layer-1');
    expect(outcome.ok && outcome.vision.layer).toBe('layer-1');
    const outermost = addVision(TWO, 'root', null);
    expect(outermost.ok && 'layer' in outermost.vision).toBe(false);
  });

  it('gets an id that no vision already has', () => {
    const first = addVision(TWO, 'a', null, undefined, 5);
    if (!first.ok) throw new Error('refused');
    const second = addVision(first.workspace, 'b', null, undefined, 5);
    expect(second.ok && second.vision.id).toBe('v_5_1');
  });

  it('is renamed trimmed, opened, closed and moved', () => {
    const made = addVision(TWO, 'a', null, undefined, 1);
    if (!made.ok) throw new Error('refused');
    let workspace = renameVision(made.workspace, 'v_1', ' b ');
    expect(workspace.visions[0]?.name).toBe('b');
    workspace = renameVision(workspace, 'v_1', '  ');
    expect(workspace.visions[0]?.name).toBe('b');
    workspace = setVisionOpen(workspace, 'v_1', true);
    expect(workspace.visions[0]?.open).toBe(true);
    workspace = moveVision(workspace, 'v_1', { x: -5, y: 9 });
    expect(workspace.visions[0]?.position).toEqual({ x: -5, y: 9 });
  });
});

describe('membership', () => {
  const made = addVision(TWO, 'prod', null, { x: 50, y: 50 }, 1);
  const WITH_VISION = made.ok ? made.workspace : TWO;

  it('puts a component in, flowing: its absolute position is dropped', () => {
    const workspace = addMember(WITH_VISION, 'v_1', 'c1');

    expect(workspace.visions[0]?.components).toEqual(['c1']);
    expect(visionOf(workspace, 'c1')?.id).toBe('v_1');
    expect(workspace.components.find((one) => one.id === 'c1')?.position).toBeUndefined();
  });

  it('puts a component in pinned where the pointer left it, relative to the vision', () => {
    const workspace = addMember(WITH_VISION, 'v_1', 'c1', { x: 250, y: 150 });

    expect(workspace.components.find((one) => one.id === 'c1')?.position).toEqual({ x: 200, y: 100 });
  });

  it('moves a component from one vision to another, never in two', () => {
    const second = addVision(WITH_VISION, 'lab', null, { x: 0, y: 0 }, 2);
    if (!second.ok) throw new Error('refused');
    let workspace = addMember(second.workspace, 'v_1', 'c1');
    workspace = addMember(workspace, 'v_2', 'c1');

    expect(workspace.visions.find((one) => one.id === 'v_1')?.components).toEqual([]);
    expect(workspace.visions.find((one) => one.id === 'v_2')?.components).toEqual(['c1']);
  });

  it('is a no-op for a vision or a component that is not there, and keeps the order', () => {
    let workspace = addMember(WITH_VISION, 'v_1', 'c2');
    workspace = addMember(workspace, 'v_1', 'c1');
    expect(workspace.visions[0]?.components).toEqual(['c2', 'c1']);
    expect(addMember(workspace, 'v_1', 'c1')).toBe(workspace);
    expect(addMember(workspace, 'v_9', 'c1')).toBe(workspace);
    expect(addMember(workspace, 'v_1', 'c9')).toBe(workspace);
  });

  it('takes a component out at the absolute position it was dropped', () => {
    let workspace = addMember(WITH_VISION, 'v_1', 'c1', { x: 250, y: 150 });
    workspace = removeMember(workspace, 'c1', { x: 900, y: 40 });

    expect(workspace.visions[0]?.components).toEqual([]);
    expect(visionOf(workspace, 'c1')).toBeUndefined();
    expect(workspace.components.find((one) => one.id === 'c1')?.position).toEqual({ x: 900, y: 40 });
  });

  it('takes a component out where it stood when no drop point is given', () => {
    /* A pinned member's absolute place is the vision's corner plus its own
       offset; a flowing one has no place of its own and gets none. */
    let workspace = addMember(WITH_VISION, 'v_1', 'c1', { x: 250, y: 150 });
    workspace = removeMember(workspace, 'c1');
    expect(workspace.components.find((one) => one.id === 'c1')?.position).toEqual({ x: 250, y: 150 });

    let flowing = addMember(WITH_VISION, 'v_1', 'c2');
    flowing = removeMember(flowing, 'c2');
    expect(flowing.components.find((one) => one.id === 'c2')?.position).toBeUndefined();
  });

  it('frees every member at its absolute place when the vision is removed', () => {
    let workspace = addMember(WITH_VISION, 'v_1', 'c1', { x: 250, y: 150 });
    workspace = addMember(workspace, 'v_1', 'c2');
    workspace = removeVision(workspace, 'v_1', { c2: { x: 300, y: 300 } });

    expect(workspace.visions).toEqual([]);
    expect(workspace.components.find((one) => one.id === 'c1')?.position).toEqual({ x: 250, y: 150 });
    expect(workspace.components.find((one) => one.id === 'c2')?.position).toEqual({ x: 300, y: 300 });
  });
});

describe('the shape for the count', () => {
  it("is the first of ADR-0022's grids that holds it, and rows of three past nine", () => {
    expect(gridFor(0)).toEqual({ columns: 1, rows: 1 });
    expect(gridFor(1)).toEqual({ columns: 1, rows: 1 });
    expect(gridFor(2)).toEqual({ columns: 2, rows: 1 });
    expect(gridFor(3)).toEqual({ columns: 3, rows: 1 });
    expect(gridFor(4)).toEqual({ columns: 2, rows: 2 });
    expect(gridFor(5)).toEqual({ columns: 3, rows: 2 });
    expect(gridFor(6)).toEqual({ columns: 3, rows: 2 });
    expect(gridFor(7)).toEqual({ columns: 3, rows: 3 });
    expect(gridFor(9)).toEqual({ columns: 3, rows: 3 });
    expect(gridFor(10)).toEqual({ columns: 3, rows: 4 });
    expect(gridFor(13)).toEqual({ columns: 3, rows: 5 });
  });
});

describe('the region', () => {
  const ICON = { w: 96, h: 112 };

  it('lays flowing members out in the shape, cells as large as their members', () => {
    const laid = layoutVision(
      [
        { id: 'a', size: { w: 400, h: 200 }, pinned: null },
        { id: 'b', size: ICON, pinned: null },
        { id: 'c', size: ICON, pinned: null },
        { id: 'd', size: { w: 200, h: 300 }, pinned: null },
      ],
      { margin: 20, gap: 16, bar: 28 },
    );

    /* Columns: max width in each; rows: max height in each. 2x2, so column
       one is 400 wide (a over c), row one is 200 tall (a beside b). */
    expect(laid.size).toEqual({ w: 20 + 400 + 16 + 200 + 20, h: 28 + 20 + 200 + 16 + 300 + 20 });
    expect(laid.centres.get('a')).toEqual({ x: 20 + 200, y: 28 + 20 + 100 });
    expect(laid.centres.get('b')).toEqual({ x: 20 + 400 + 16 + 100, y: 28 + 20 + 100 });
    expect(laid.centres.get('c')).toEqual({ x: 20 + 200, y: 28 + 20 + 200 + 16 + 150 });
    expect(laid.centres.get('d')).toEqual({ x: 20 + 400 + 16 + 100, y: 28 + 20 + 200 + 16 + 150 });
  });

  it('leaves a pinned member where it was put and flows the rest as if it were gone', () => {
    const laid = layoutVision(
      [
        { id: 'a', size: ICON, pinned: null },
        { id: 'b', size: ICON, pinned: { x: 700, y: 400 } },
        { id: 'c', size: ICON, pinned: null },
      ],
      { margin: 20, gap: 16, bar: 28 },
    );

    expect(laid.centres.get('b')).toEqual({ x: 700, y: 400 });
    /* Two flow, so 2x1 rather than 3x1. */
    expect(laid.centres.get('a')).toEqual({ x: 20 + 48, y: 28 + 20 + 56 });
    expect(laid.centres.get('c')).toEqual({ x: 20 + 96 + 16 + 48, y: 28 + 20 + 56 });
    /* The region grows to hold the pin, margin included. */
    expect(laid.size).toEqual({ w: 700 + 48 + 20, h: 400 + 56 + 20 });
  });

  it('never shrinks below the bar and a margin, and never lets a pin sit outside', () => {
    const empty = layoutVision([], { margin: 20, gap: 16, bar: 28 });
    expect(empty.size).toEqual({ w: 2 * 20 + 96, h: 28 + 2 * 20 + 112 });

    const above = layoutVision([{ id: 'a', size: ICON, pinned: { x: -10, y: 5 } }], { margin: 20, gap: 16, bar: 28 });
    /* A pin left of or above the region's own corner is pulled to the margin. */
    expect(above.centres.get('a')).toEqual({ x: 20 + 48, y: 28 + 20 + 56 });
  });
});

describe('filling the screen', () => {
  it('gives every member a cell of the shape, in order, under the bar, with the gap between', () => {
    const frames = fullScreenFrames(['a', 'b', 'c'], { width: 1000, height: 500 }, { bar: 36, gap: 8 });

    expect([...frames.keys()]).toEqual(['a', 'b', 'c']);
    const width = (1000 - 4 * 8) / 3;
    expect(frames.get('a')).toEqual({ left: 8, top: 36 + 8, width, height: 500 - 36 - 2 * 8 });
    expect(frames.get('b')?.left).toBeCloseTo(8 + width + 8);
    expect(frames.get('c')?.left).toBeCloseTo(8 + 2 * (width + 8));
  });

  it('is empty for no members, rather than one cell nobody fills', () => {
    expect(fullScreenFrames([], { width: 1000, height: 500 }, { bar: 36, gap: 8 }).size).toBe(0);
  });
});
