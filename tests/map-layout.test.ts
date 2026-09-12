/**
 * Where the map puts things, and how it is looked at.
 */

import { describe, expect, it } from 'vitest';

import {
  HOME_VIEW,
  REFIT_MIN,
  RING_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
  fitTo,
  honeycombPositions,
  placeChildren,
  ringPositions,
  terminalTreatment,
  toMap,
  toStage,
  zoomAt,
} from '../src/features/map';

const CENTRE = { x: 100, y: 100 };

describe('placing children', () => {
  it('starts a ring at twelve o’clock and spaces it evenly', () => {
    const ring = ringPositions(4, CENTRE, 50);

    expect(ring[0]?.x).toBeCloseTo(100);
    expect(ring[0]?.y).toBeCloseTo(50);
    expect(ring[1]?.x).toBeCloseTo(150);
    expect(ring[1]?.y).toBeCloseTo(100);
    expect(ring).toHaveLength(4);
  });

  it('fills a honeycomb six, then twelve, then eighteen to a ring', () => {
    const cells = honeycombPositions(20, CENTRE, 10);
    const radii = cells.map((p) => Math.round(Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y)));

    expect(radii.slice(0, 6).every((r) => r === 10)).toBe(true);
    expect(radii.slice(6, 18).every((r) => r === 20)).toBe(true);
    expect(radii.slice(18).every((r) => r === 30)).toBe(true);
  });

  it('uses a ring up to the limit and a honeycomb beyond it', () => {
    const few = placeChildren(
      Array.from({ length: RING_MAX }, (_, i) => ({ id: `c${String(i)}` })),
      CENTRE,
      50,
    );
    const many = placeChildren(
      Array.from({ length: RING_MAX + 1 }, (_, i) => ({ id: `c${String(i)}` })),
      CENTRE,
      50,
    );

    const radius = (p: { x: number; y: number }) => Math.round(Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y));
    expect(new Set(few.map(radius))).toEqual(new Set([50]));
    expect(new Set(many.map(radius)).size).toBeGreaterThan(1);
  });

  it('keeps a child where the user left it without moving the others', () => {
    const slots = new Map<string, number>();
    const free = placeChildren([{ id: 'a' }, { id: 'b' }, { id: 'c' }], CENTRE, 50, slots);
    const pinned = placeChildren([{ id: 'a' }, { id: 'b', position: { x: 7, y: 7 } }, { id: 'c' }], CENTRE, 50, slots);

    expect(pinned[1]).toEqual({ x: 7, y: 7 });
    expect(pinned[0]).toEqual(free[0]);
    expect(pinned[2]).toEqual(free[2]);
  });

  it('leaves every other child on its own slot when one leaves the set (#387)', () => {
    const slots = new Map<string, number>();
    const before = placeChildren([{ id: 'a' }, { id: 'b' }, { id: 'c' }], CENTRE, 50, slots);
    const after = placeChildren([{ id: 'a' }, { id: 'c' }], CENTRE, 50, slots);

    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual(before[2]);
  });

  it('gives a returning child a free slot rather than reusing a live one', () => {
    const slots = new Map<string, number>();
    placeChildren([{ id: 'a' }, { id: 'b' }], CENTRE, 50, slots);
    placeChildren([{ id: 'a' }], CENTRE, 50, slots);
    const back = placeChildren([{ id: 'a' }, { id: 'b' }], CENTRE, 50, slots);

    expect(new Set(back.map((p) => `${String(p.x)},${String(p.y)}`)).size).toBe(2);
  });
});

describe('the view', () => {
  it('maps a stage point to the map and back', () => {
    const view = { x: 30, y: -10, scale: 0.5 };
    const p = { x: 200, y: 140 };

    expect(toStage(view, toMap(view, p))).toEqual(p);
  });

  it('zooms about the point under the cursor', () => {
    const cursor = { x: 300, y: 200 };
    const before = toMap(HOME_VIEW, cursor);

    const zoomed = zoomAt(HOME_VIEW, cursor, 1.25);

    expect(zoomed.scale).toBeCloseTo(1.25);
    expect(toMap(zoomed, cursor).x).toBeCloseTo(before.x);
    expect(toMap(zoomed, cursor).y).toBeCloseTo(before.y);
  });

  it('stops at the zoom limits and does not drift when it does', () => {
    let view = HOME_VIEW;
    for (let i = 0; i < 40; i += 1) view = zoomAt(view, { x: 0, y: 0 }, 0.5);
    expect(view.scale).toBe(ZOOM_MIN);

    const stuck = zoomAt(view, { x: 500, y: 500 }, 0.5);
    expect(stuck).toBe(view);

    for (let i = 0; i < 40; i += 1) view = zoomAt(view, { x: 0, y: 0 }, 2);
    expect(view.scale).toBe(ZOOM_MAX);
  });

  it('fits a rectangle whole, centred, at the largest scale that fits', () => {
    const view = fitTo({ left: 0, top: 0, right: 1000, bottom: 500 }, 500, 500, 0);

    expect(view.scale).toBeCloseTo(0.5);
    expect(toStage(view, { x: 500, y: 250 })).toEqual({ x: 250, y: 250 });
  });

  it('treats a terminal as a thumbnail below the measured floor', () => {
    expect(terminalTreatment(REFIT_MIN)).toBe('refit');
    expect(terminalTreatment(1.25)).toBe('refit');
    expect(terminalTreatment(0.5)).toBe('thumbnail');
  });
});
