/**
 * Keeps a menu on screen.
 *
 * A row near the bottom of a tall sidebar opens a menu that would run past the
 * window, and a menu whose last item is off screen hides the one that deletes.
 *
 * The row menu this once placed (connect/disconnect) retired with the row it
 * belonged to (ADR-0072). `GroupMenu` still opens on a click inside the
 * terminal grid and still needs to stay on screen, which is what keeps this
 * function itself alive.
 */
export function menuPosition(
  at: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  return {
    x: Math.max(4, Math.min(at.x, viewport.width - size.width - 4)),
    y: Math.max(4, Math.min(at.y, viewport.height - size.height - 4)),
  };
}
