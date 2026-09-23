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
