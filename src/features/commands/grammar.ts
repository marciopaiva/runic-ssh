/**
 * What the Bar's text means.
 *
 * The first character picks a mode and the rest is the search term. The tokens
 * are not translated: they are keys, like the `:` of an editor, and a token
 * that changed with the language would make a shared habit impossible.
 *
 * | Token | Mode | Rows |
 * | --- | --- | --- |
 * | `@` | hosts | saved hosts, to put in the scope |
 * | `>` | macros | saved macros only (ADR-0078) |
 * | `/` | files | hosts, to open their files |
 * | none | all | actions, hosts and macros, recents first |
 *
 * Pure, so the grammar can be asserted without rendering anything.
 */

export type BarMode = 'all' | 'hosts' | 'macros' | 'files';

export interface ParsedBar {
  readonly mode: BarMode;
  /** The text after the token, which is what ranking sees. */
  readonly term: string;
}

const TOKENS: Readonly<Record<string, Exclude<BarMode, 'all'>>> = {
  '@': 'hosts',
  '>': 'macros',
  '/': 'files',
};

export function parseBar(text: string): ParsedBar {
  const first = text.charAt(0);
  const mode = TOKENS[first];
  if (mode === undefined) return { mode: 'all', term: text };
  return { mode, term: text.slice(1) };
}

/** What a row is, so a mode can ask for the rows that belong to it. */
export type BarRole = 'host' | 'macro' | 'files';

/** Whether a row with this role is listed in this mode. */
export function listedIn(mode: BarMode, role: BarRole | undefined): boolean {
  switch (mode) {
    case 'hosts':
      return role === 'host';
    case 'macros':
      return role === 'macro';
    case 'files':
      return role === 'files';
    case 'all':
      /* Files rows would repeat every host a second time. */
      return role !== 'files';
  }
}

/**
 * Whether a keystroke opens or closes the Bar.
 *
 * Ctrl+Shift+P, and Cmd+K on a Mac. Plain Ctrl+K is not used: in a terminal it
 * is "kill to end of line" in readline and a command in nano and emacs, and a
 * shortcut that eats it would take a key away from the thing this program
 * exists to carry. Ctrl+Shift+P produces no control code, so nothing is lost.
 */
export function isBarShortcut(
  event: Pick<KeyboardEvent, 'type' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>,
  mac: boolean,
): boolean {
  if (event.type !== 'keydown' || event.altKey) return false;
  if (mac) return event.code === 'KeyK' && event.metaKey && !event.ctrlKey && !event.shiftKey;
  return event.code === 'KeyP' && event.ctrlKey && event.shiftKey && !event.metaKey;
}

/**
 * Moves rows the person ran before to the top, most recent first, keeping the
 * rest in the order they came. Only used while the text is empty: once there
 * is a search, rank decides.
 */
export function recentsFirst<T extends { readonly id: string }>(
  rows: readonly T[],
  recents: readonly string[],
): readonly T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const top = recents.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
  const topIds = new Set(top.map((row) => row.id));
  return [...top, ...rows.filter((row) => !topIds.has(row.id))];
}

/** The most recent ids kept, newest first, each once. */
export const RECENT_LIMIT = 5;

export function remember(recents: readonly string[], id: string): readonly string[] {
  return [id, ...recents.filter((existing) => existing !== id)].slice(0, RECENT_LIMIT);
}
