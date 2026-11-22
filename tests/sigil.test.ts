import { describe, expect, it } from 'vitest';

import { sigilOf } from '../src/features/sigil/sigil';

describe('sigilOf', () => {
  it('draws the same mark for the same id, every time', () => {
    expect(sigilOf('fx2')).toEqual(sigilOf('fx2'));
  });

  it('draws a different one for a different id, most of the time', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `host-${i}`);
    const shapes = new Set(ids.map((id) => JSON.stringify(sigilOf(id).levels)));

    expect(shapes.size).toBeGreaterThan(20);
  });

  it('always has a stem and at least one branch on every level', () => {
    for (let i = 0; i < 200; i += 1) {
      const sigil = sigilOf(`id-${i}`);
      expect(sigil.stem.d).toBe('M12 21V3');
      for (const level of sigil.levels) expect(level.strokes.length).toBeGreaterThan(0);
    }
  });

  it('keeps every stroke inside the 24 box', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const level of sigilOf(`id-${i}`).levels) {
        for (const stroke of level.strokes) {
          const nums = stroke.d.match(/-?\d+/g)?.map(Number) ?? [];
          const [x, y, dx, dy] = nums;
          expect(x).toBe(12);
          expect(y).toBeGreaterThanOrEqual(3);
          expect((x ?? 0) + (dx ?? 0)).toBeGreaterThanOrEqual(0);
          expect((x ?? 0) + (dx ?? 0)).toBeLessThanOrEqual(24);
          expect((y ?? 0) + (dy ?? 0)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
