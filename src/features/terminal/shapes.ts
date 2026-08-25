/**
 * What each shape is called.
 *
 * Apart from `groups.ts`, which is arithmetic and has no business knowing that
 * an interface exists, and apart from the two places that draw the list. The
 * palette and the control in the top strip offer the same seven things, and a
 * shape named one way in one of them and another way in the other is the kind
 * of drift ADR-0020 spent a release removing.
 */

import type { Grid } from './groups';

/**
 * The keys themselves, not `MessageKey`.
 *
 * `t` refuses a parameter object when a message has no holes and demands one
 * when it does, which it works out from the key. A widened key is a key that
 * might have holes, and every caller would have to hand it something to fill
 * them with.
 */
export type ShapeLabel =
  | 'command.split.none'
  | 'command.split.columns'
  | 'command.split.rows'
  | 'command.split.grid'
  | 'command.split.sixWide'
  | 'command.split.sixTall'
  | 'command.split.nine';

export const SHAPE_LABEL: Readonly<Record<Grid, ShapeLabel>> = {
  '1x1': 'command.split.none',
  '2x1': 'command.split.columns',
  '1x2': 'command.split.rows',
  '2x2': 'command.split.grid',
  '3x2': 'command.split.sixWide',
  '2x3': 'command.split.sixTall',
  '3x3': 'command.split.nine',
};

/** The columns and rows a shape's name promises. */
export function dimensions(grid: Grid): { readonly columns: number; readonly rows: number } {
  const [columns, rows] = grid.split('x').map(Number);

  return { columns: columns ?? 1, rows: rows ?? 1 };
}
