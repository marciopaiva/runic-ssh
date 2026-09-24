/**
 * One Escape key, one thing undone (ADR-0068 follow-up, #387).
 *
 * The map used to answer Escape with five independent `window` listeners,
 * one per overlay (a line being drawn, a vision filling the screen, a
 * layer, the context menu, the host editor), each guarding itself against
 * the others by name. Found running the map: closing the menu with Escape
 * left the layer in the same keystroke too, since both listeners sat on
 * `window` at once and neither knew the other existed. This hook is the
 * fix generalized rather than patched again at the next call site: one
 * listener, one ranked list of what Escape could mean right now, and only
 * the first active one answers.
 */

import { useEffect, useRef } from 'react';

/** One thing Escape could undo, and whether it currently applies. Earlier
    entries take priority: `onEscape` fires for the first active one only. */
export interface EscapeLayer {
  readonly active: boolean;
  readonly onEscape: () => void;
}

/** Listens for Escape only while at least one layer is active, and hands
    the keystroke to the highest-priority active one. Removed the moment
    none are, so the map never holds a key listener it has no use for, the
    same rule the listeners this replaces already followed. */
export function useEscapeRouter(layers: readonly EscapeLayer[]): void {
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const anyActive = layers.some((layer) => layer.active);

  useEffect(() => {
    if (!anyActive) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const top = layersRef.current.find((layer) => layer.active);
      top?.onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyActive]);
}
