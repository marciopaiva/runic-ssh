/**
 * A component's window behaves the way a window does on Windows.
 */

import { describe, expect, it } from 'vitest';

import {
  MIN_SIZE,
  RESIZE_HANDLES,
  SNAP_MARGIN,
  edgePoint,
  keepInside,
  terminalBox,
  resizeCursor,
  resizeFrom,
  snapRect,
  snapZone,
} from '../src/features/map';

const START = { w: 500, h: 300 };

describe('resizing', () => {
  it('pulling the right edge widens and keeps the left edge still', () => {
    const r = resizeFrom('e', START, { x: 40, y: 0 });

    expect(r.size).toEqual({ w: 540, h: 300 });
    expect(r.centreShift).toEqual({ x: 20, y: 0 });
  });

  it('pulling the left edge leftwards widens and keeps the right edge still', () => {
    const r = resizeFrom('w', START, { x: -40, y: 0 });

    expect(r.size).toEqual({ w: 540, h: 300 });
    expect(r.centreShift).toEqual({ x: -20, y: 0 });
  });

  it('a corner moves both dimensions', () => {
    const r = resizeFrom('nw', START, { x: -10, y: -20 });

    expect(r.size).toEqual({ w: 510, h: 320 });
    expect(r.centreShift).toEqual({ x: -5, y: -10 });
  });

  it('stops at the floor and the opposite edge stops creeping there', () => {
    const r = resizeFrom('se', START, { x: -1000, y: -1000 });

    expect(r.size).toEqual(MIN_SIZE);
    expect(r.centreShift).toEqual({ x: (MIN_SIZE.w - START.w) / 2, y: (MIN_SIZE.h - START.h) / 2 });

    const again = resizeFrom('se', MIN_SIZE, { x: -50, y: -50 });
    expect(again.centreShift).toEqual({ x: 0, y: 0 });
  });

  it('gives every handle a cursor', () => {
    for (const handle of RESIZE_HANDLES) {
      expect(resizeCursor(handle)).toMatch(/-resize$/);
    }
  });
});

describe('snapping', () => {
  it('maximises at the top edge and halves at the sides', () => {
    expect(snapZone({ x: 400, y: SNAP_MARGIN - 1 }, 1000)).toBe('full');
    expect(snapZone({ x: SNAP_MARGIN - 1, y: 400 }, 1000)).toBe('left');
    expect(snapZone({ x: 1000 - SNAP_MARGIN + 1, y: 400 }, 1000)).toBe('right');
    expect(snapZone({ x: 400, y: 400 }, 1000)).toBeNull();
  });

  it('prefers maximising in a corner', () => {
    expect(snapZone({ x: 2, y: 2 }, 1000)).toBe('full');
  });

  it('fills the stage or exactly half of it', () => {
    expect(snapRect('full', 1000, 600)).toEqual({ left: 0, top: 0, width: 1000, height: 600 });
    expect(snapRect('left', 1000, 600)).toEqual({ left: 0, top: 0, width: 500, height: 600 });
    expect(snapRect('right', 1000, 600)).toEqual({ left: 500, top: 0, width: 500, height: 600 });
  });
});

describe('a line to a window', () => {
  it('ends on the border, not the centre', () => {
    const centre = { x: 0, y: 0 };
    const right = edgePoint(centre, { w: 100, h: 50 }, { x: 500, y: 0 }, 0);
    const down = edgePoint(centre, { w: 100, h: 50 }, { x: 0, y: 500 }, 0);

    expect(right).toEqual({ x: 50, y: 0 });
    expect(down).toEqual({ x: 0, y: 25 });
  });
});

describe('keeping a window on the stage', () => {
  it('leaves a window that already fits where it is', () => {
    const rect = { left: 100, top: 80, width: 360, height: 200 };
    expect(keepInside(rect, 1200, 700)).toBe(rect);
  });

  it('slides a window in from the edge it crossed', () => {
    expect(keepInside({ left: -40, top: -90, width: 360, height: 200 }, 1200, 700)).toEqual({ left: 0, top: 0, width: 360, height: 200 });
    expect(keepInside({ left: 1000, top: 600, width: 360, height: 200 }, 1200, 700)).toEqual({ left: 840, top: 500, width: 360, height: 200 });
  });

  it('keeps the top-left corner of one larger than the stage', () => {
    expect(keepInside({ left: -30, top: -30, width: 1400, height: 900 }, 1200, 700)).toEqual({ left: 0, top: 0, width: 1400, height: 900 });
  });

  it('does nothing on a stage that has not been measured', () => {
    const rect = { left: -40, top: -90, width: 360, height: 200 };
    expect(keepInside(rect, 0, 0)).toBe(rect);
  });
});

describe('the box a terminal is drawn in', () => {
  const body = { left: 100, top: 128, width: 560, height: 332 };

  it('refits at 1:1, held in from the sides the resize handles sit on', () => {
    expect(terminalBox(body, 1, 'refit')).toEqual({ left: 104, top: 128, width: 552, height: 328, scale: 1, interactive: true });
    expect(terminalBox(body, 1.2, 'refit').scale).toBe(1);
  });

  it('keeps its 100% size as a thumbnail and scales the drawing instead', () => {
    const box = terminalBox({ left: 100, top: 128, width: 280, height: 166 }, 0.5, 'thumbnail');
    expect(box).toEqual({ left: 104, top: 128, width: 544, height: 324, scale: 0.5, interactive: false });
  });
});
