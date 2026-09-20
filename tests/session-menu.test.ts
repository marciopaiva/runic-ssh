/**
 * Keeps a context menu on screen.
 *
 * The row-level connect/disconnect menu this file used to guard retired with
 * the row it belonged to (ADR-0072): sessions no longer live in a sidebar
 * list, so there is no row left to right-click. `menuPosition` itself stays,
 * since `GroupMenu` still opens on a click inside the terminal grid and still
 * needs to stay on screen.
 */

import { describe, expect, it } from 'vitest';

import { menuPosition } from '../src/features/sessions/menu';

describe('placing the menu', () => {
  const size = { width: 168, height: 92 };
  const viewport = { width: 1440, height: 900 };

  it('opens where it was asked to', () => {
    expect(menuPosition({ x: 200, y: 300 }, size, viewport)).toEqual({ x: 200, y: 300 });
  });

  it('stays on screen near the bottom', () => {
    /* A menu whose last item is off screen hides the one that deletes. */
    const { y } = menuPosition({ x: 200, y: 880 }, size, viewport);

    expect(y + size.height).toBeLessThanOrEqual(viewport.height);
  });

  it('stays on screen near the right edge', () => {
    const { x } = menuPosition({ x: 1430, y: 300 }, size, viewport);

    expect(x + size.width).toBeLessThanOrEqual(viewport.width);
  });

  it('never goes off the top or the left', () => {
    expect(menuPosition({ x: -50, y: -50 }, size, viewport)).toEqual({ x: 4, y: 4 });
  });
});
