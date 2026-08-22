/**
 * Finding a command by typing part of its name.
 *
 * Two things this has to get right that a naive `includes` does not.
 *
 * **Accents.** Someone typing `sessao` is looking for `Sessão`, and someone
 * typing `conexion` is looking for `Conexión`. In a client translated into
 * three languages, two of which put diacritics in ordinary words, matching on
 * the raw string means the search box stops working the moment the interface
 * is not in English. Both sides are folded before anything is compared.
 *
 * **Where the match landed.** A query matching the start of a word is almost
 * always what was meant; the same letters scattered through the middle almost
 * never are. Scoring by position is what keeps `close` from ranking
 * `Disconnect all sessions` above `Close tab`.
 */

import type { Command } from './registry';

export interface Match {
  readonly command: Command;
  readonly score: number;
  /** Indices in the title that matched, for highlighting. */
  readonly highlights: readonly number[];
}

/**
 * Lower case, without diacritics.
 *
 * NFD splits a letter from its accent, and the combining marks are then
 * dropped — which is what makes `ç` fold to `c` rather than to nothing.
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const WORD_START = /[\s\-_/:.]/;

/**
 * Scores one candidate against a query.
 *
 * Returns `null` when the query's characters do not appear in order.
 */
function scoreAgainst(query: string, candidate: string): { score: number; at: number[] } | null {
  const folded = fold(candidate);
  const at: number[] = [];
  let score = 0;
  let cursor = 0;

  for (const wanted of query) {
    const found = folded.indexOf(wanted, cursor);
    if (found < 0) return null;

    const previous = folded[found - 1];
    const startsWord = found === 0 || (previous !== undefined && WORD_START.test(previous));
    const consecutive = at.length > 0 && found === at[at.length - 1]! + 1;

    /* A run of letters at the start of a word is what someone typing an
       abbreviation means. Everything else still matches, but ranks below. */
    if (found === 0) score += 12;
    else if (startsWord) score += 8;
    else if (consecutive) score += 4;
    else score += 1;

    at.push(found);
    cursor = found + 1;
  }

  /* Shorter titles win ties: "Close tab" over "Close tab and disconnect". */
  return { score: score - folded.length * 0.01, at };
}

/**
 * Ranks commands against a query.
 *
 * An empty query keeps the registry's own order, which is the order the
 * sections were registered in. That is deliberate: an empty palette is a menu,
 * and a menu that reorders itself is not one.
 */
export function rank(query: string, commands: readonly Command[]): readonly Match[] {
  const wanted = fold(query.trim());

  if (wanted === '') {
    return commands.map((command) => ({ command, score: 0, highlights: [] }));
  }

  const matched: Match[] = [];

  for (const command of commands) {
    const title = scoreAgainst(wanted, command.title);

    if (title !== null) {
      matched.push({ command, score: title.score, highlights: title.at });
      continue;
    }

    /* Keywords match but never highlight, because they are not on screen.
       Scored below any title match so a host name never outranks a name. */
    const keyword = (command.keywords ?? [])
      .map((word) => scoreAgainst(wanted, word))
      .find((result) => result !== null);

    if (keyword !== undefined && keyword !== null) {
      matched.push({ command, score: keyword.score - 100, highlights: [] });
    }
  }

  /* Stable: equal scores keep registry order, so the list does not shuffle
     while somebody is looking at it. */
  return matched
    .map((match, index) => ({ match, index }))
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .map(({ match }) => match);
}
