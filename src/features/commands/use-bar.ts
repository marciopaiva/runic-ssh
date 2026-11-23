/**
 * Opening, closing and driving the Bar.
 *
 * The state that used to sit in the palette hook plus what the Bar adds: the
 * scope (hosts put in chips with `@`) and the commands run in this window,
 * most recent first. Both live in memory only. Nothing about what somebody ran
 * is written to disk, and a scope does not outlive the Bar it was built in, so
 * a chip is never left standing where it is no longer on screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { isMac } from '../../lib/platform';

import { isBarShortcut, listedIn, parseBar, recentsFirst, remember } from './grammar';
import type { BarMode } from './grammar';
import { moveBy } from './navigation';
import { rank } from './match';
import type { Match } from './match';
import { collect } from './registry';
import type { CommandSource } from './registry';

interface BarState {
  readonly open: boolean;
  readonly query: string;
  readonly mode: BarMode;
  readonly matches: readonly Match[];
  readonly selected: number;
  /** Saved host ids, in the order they were added. */
  readonly scope: readonly string[];
  readonly setQuery: (query: string) => void;
  readonly move: (step: number) => void;
  readonly select: (index: number) => void;
  readonly run: (index?: number) => void;
  readonly removeScope: (sessionId: string) => void;
  readonly popScope: () => void;
  readonly show: () => void;
  readonly dismiss: () => void;
}

export function useBar(sources: readonly CommandSource[], recentLabel: string): BarState {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [selected, setSelected] = useState(0);
  const [scope, setScope] = useState<readonly string[]>([]);
  const [recents, setRecents] = useState<readonly string[]>([]);

  const { mode, term } = useMemo(() => parseBar(query), [query]);

  /* Asked at the moment the Bar opens, and again as state changes behind it,
     so a tab closed under the Bar stops being offered. */
  const commands = useMemo(
    () => (open ? collect(sources, scope).filter((command) => listedIn(mode, command.role)) : []),
    [open, sources, scope, mode],
  );

  const matches = useMemo(() => {
    if (term.trim() !== '' || mode !== 'all') return rank(term, commands);

    /* An empty Bar is a menu with what was just used on top, under its own
       heading so the list does not look reshuffled for no reason. */
    const ordered = recentsFirst(commands, recents);
    const top = new Set(recents);
    return rank(
      '',
      ordered.map((command) => (top.has(command.id) ? { ...command, group: recentLabel } : command)),
    );
  }, [commands, term, mode, recents, recentLabel]);

  const dismiss = useCallback((): void => {
    setOpen(false);
    setQueryState('');
    setSelected(0);
    setScope([]);
  }, []);

  const show = useCallback((): void => {
    setQueryState('');
    setSelected(0);
    setScope([]);
    setOpen(true);
  }, []);

  const setQuery = useCallback((next: string): void => {
    setQueryState(next);
    /* Back to the top. Keeping the index would leave the highlight on
       whatever is in that position now, which is how a Bar runs something
       the user did not read. */
    setSelected(0);
  }, []);

  const move = useCallback(
    (step: number): void => {
      setSelected((current) => moveBy(matches.length, current, step));
    },
    [matches.length],
  );

  const run = useCallback(
    (index?: number): void => {
      const match = matches[index ?? selected];
      if (match === undefined) return;
      const { command } = match;

      /* In `@` a row is put in the scope rather than run, and the Bar stays
         open for the next one. Picking a host that is already there takes it
         out again. */
      if (mode === 'hosts' && command.subject !== undefined) {
        const subject = command.subject;
        setScope((current) =>
          current.includes(subject) ? current.filter((id) => id !== subject) : [...current, subject],
        );
        setQueryState('');
        setSelected(0);
        return;
      }

      setRecents((current) => remember(current, command.id));
      /* Closed before running. A command that opens a window or changes the
         workspace should not do it behind a Bar still on screen. */
      dismiss();
      command.run();
    },
    [matches, selected, mode, dismiss],
  );

  const removeScope = useCallback((sessionId: string): void => {
    setScope((current) => current.filter((id) => id !== sessionId));
  }, []);

  const popScope = useCallback((): void => {
    setScope((current) => current.slice(0, -1));
  }, []);

  /* The shortcut is taken in the capture phase of the window, ahead of xterm,
     so it works with a terminal focused. The key it takes produces no control
     code (see `isBarShortcut`), so nothing a shell reads is lost. */
  useEffect(() => {
    const mac = isMac(navigator.userAgent);
    const onKey = (event: KeyboardEvent): void => {
      if (!isBarShortcut(event, mac)) return;
      event.preventDefault();
      event.stopPropagation();
      if (open) dismiss();
      else show();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, show, dismiss]);

  return {
    open,
    query,
    mode,
    matches,
    selected,
    scope,
    setQuery,
    move,
    select: setSelected,
    run,
    removeScope,
    popScope,
    show,
    dismiss,
  };
}
