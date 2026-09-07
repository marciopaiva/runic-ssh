import { describe, expect, it } from 'vitest';

import { niceMax } from '../src/features/monitor';

describe('picking a chart axis ceiling', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceMax(0.42)).toBe(0.5);
    expect(niceMax(1.3)).toBe(2);
    expect(niceMax(3.1)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(45)).toBe(50);
  });

  it('never returns a ceiling below the peak it was given', () => {
    for (const peak of [0.01, 0.42, 1, 2.5, 9.9, 60, 999]) {
      expect(niceMax(peak)).toBeGreaterThanOrEqual(peak);
    }
  });

  it('gives a nonzero ceiling to a host with nothing measured yet', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-1)).toBe(1);
  });
});
