/**
 * A press is a click, a hold or a drag, and never two of them.
 */

import { describe, expect, it } from 'vitest';

import {
  DRAG_THRESHOLD,
  HOLD_MS,
  beginPress,
  holdFired,
  movePress,
  radialSegment,
  releasePress,
} from '../src/features/map';

const ORIGIN = { x: 100, y: 100 };

describe('a press on the map', () => {
  it('released before anything else is a click', () => {
    const press = beginPress('c1', ORIGIN, 0);

    expect(releasePress(press)).toEqual({ kind: 'click', target: 'c1' });
  });

  it('that lasts the hold time without moving is a hold', () => {
    const press = holdFired(beginPress('c1', ORIGIN, 0), HOLD_MS);

    expect(releasePress(press)).toEqual({ kind: 'hold', target: 'c1', at: ORIGIN });
  });

  it('that moves past the threshold is a drag, and can no longer become a hold', () => {
    let press = beginPress('c1', ORIGIN, 0);
    press = movePress(press, { x: ORIGIN.x + DRAG_THRESHOLD + 1, y: ORIGIN.y });
    press = holdFired(press, HOLD_MS);

    expect(releasePress(press)).toEqual({ kind: 'drag', target: 'c1' });
  });

  it('that jitters inside the threshold is still a click', () => {
    let press = beginPress('c1', ORIGIN, 0);
    press = movePress(press, { x: ORIGIN.x + DRAG_THRESHOLD - 1, y: ORIGIN.y });

    expect(releasePress(press).kind).toBe('click');
  });

  it('ignores a hold timer that fires early', () => {
    const press = holdFired(beginPress('c1', ORIGIN, 0), HOLD_MS - 1);

    expect(releasePress(press).kind).toBe('click');
  });

  it('once held, moving does not turn it into a drag', () => {
    let press = holdFired(beginPress('c1', ORIGIN, 0), HOLD_MS);
    press = movePress(press, { x: ORIGIN.x + 200, y: ORIGIN.y });

    expect(releasePress(press).kind).toBe('hold');
  });
});

describe('the radial menu', () => {
  it('has a dead centre where releasing cancels', () => {
    expect(radialSegment(ORIGIN, ORIGIN, 4)).toBe(-1);
    expect(radialSegment(ORIGIN, { x: ORIGIN.x + 10, y: ORIGIN.y }, 4)).toBe(-1);
  });

  it('starts at twelve o’clock and runs clockwise', () => {
    expect(radialSegment(ORIGIN, { x: ORIGIN.x + 10, y: ORIGIN.y - 100 }, 4)).toBe(0);
    expect(radialSegment(ORIGIN, { x: ORIGIN.x + 100, y: ORIGIN.y + 10 }, 4)).toBe(1);
    expect(radialSegment(ORIGIN, { x: ORIGIN.x - 10, y: ORIGIN.y + 100 }, 4)).toBe(2);
    expect(radialSegment(ORIGIN, { x: ORIGIN.x - 100, y: ORIGIN.y - 10 }, 4)).toBe(3);
  });

  it('never returns a segment past the last option', () => {
    for (let a = 0; a < 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      const seg = radialSegment(ORIGIN, { x: ORIGIN.x + Math.cos(rad) * 100, y: ORIGIN.y + Math.sin(rad) * 100 }, 7);
      expect(seg).toBeGreaterThanOrEqual(0);
      expect(seg).toBeLessThan(7);
    }
    expect(radialSegment(ORIGIN, { x: ORIGIN.x + 100, y: ORIGIN.y }, 0)).toBe(-1);
  });
});
