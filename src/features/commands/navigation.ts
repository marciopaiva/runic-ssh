/**
 * Moving through the result list.
 *
 * Separate from the component because these are the rules a keyboard user
 * feels and nobody looks at: what Down does at the bottom, what happens to the
 * selection when the query narrows the list under it, what Enter runs.
 */

import type { Match } from './match';

/**
 * The index an arrow key moves to.
 *
 * Wraps. A palette is a short list and stopping at the end reads as the key
 * not having registered.
 */
export function moveBy(count: number, current: number, step: number): number {
  if (count === 0) return 0;
  return (current + step + count) % count;
}

/**
 * Where the selection lands after the query changes.
 *
 * Always the top result. Keeping the previous index would leave the highlight
 * on whatever happens to be in that position now, which is how a palette runs
 * something the user did not read.
 */
export function selectionAfterQuery(): number {
  return 0;
}

/** The command Enter runs, or `null` when nothing matched. */
export function commandAt(matches: readonly Match[], selected: number): Match | null {
  return matches[selected] ?? null;
}

/**
 * Whether a key event is the palette's shortcut.
 *
 * `event.code` rather than `event.key`: with Shift held, `key` is `P` on a US
 * layout and something else on layouts where Shift-P is not P. The physical
 * key is the same everywhere, which is what a shortcut should follow.
 */
export function isPaletteShortcut(
  event: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey'>,
  modifier: 'meta' | 'control',
): boolean {
  if (event.code !== 'KeyP' || !event.shiftKey) return false;

  /* Exclusive: Ctrl-Cmd-Shift-P on a Mac is not this shortcut, and treating it
     as one would swallow a system or terminal binding. */
  return modifier === 'meta'
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
