/**
 * Opening, closing and driving the palette.
 *
 * The shortcut is bound on the document rather than on a component, because a
 * palette that only opens when something in particular has focus is not a
 * palette. `capture` is deliberate: the terminal takes every keystroke it can,
 * and the shortcut has to be recognised before it reaches one.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CommandModifier } from '../../ipc';

import { isPaletteShortcut, moveBy } from './navigation';
import { rank } from './match';
import type { Match } from './match';
import { collect } from './registry';
import type { CommandSource } from './registry';

interface PaletteState {
  readonly open: boolean;
  readonly query: string;
  readonly matches: readonly Match[];
  readonly selected: number;
  readonly setQuery: (query: string) => void;
  readonly move: (step: number) => void;
  readonly select: (index: number) => void;
  readonly run: (index?: number) => void;
  readonly show: () => void;
  readonly dismiss: () => void;
}

export function usePalette(
  sources: readonly CommandSource[],
  modifier: CommandModifier,
): PaletteState {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [selected, setSelected] = useState(0);

  /* Asked at the moment the palette opens, and again as state changes behind
     it, so a tab closed under the palette stops being offered. */
  const commands = useMemo(
    () => (open ? collect(sources) : []),
    [open, sources],
  );
  const matches = useMemo(() => rank(query, commands), [query, commands]);

  const dismiss = useCallback((): void => {
    setOpen(false);
    setQueryState('');
    setSelected(0);
  }, []);

  const show = useCallback((): void => {
    setQueryState('');
    setSelected(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isPaletteShortcut(event, modifier)) {
        event.preventDefault();
        /* Toggling rather than always opening: pressing it twice should leave
           the user where they started, not stack a second palette. */
        setOpen((current) => {
          if (!current) {
            setQueryState('');
            setSelected(0);
          }
          return !current;
        });
      }
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [modifier]);

  const setQuery = useCallback((next: string): void => {
    setQueryState(next);
    /* Back to the top. Keeping the index would leave the highlight on
       whatever is in that position now, which is how a palette runs something
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

      /* Closed before running. A command that opens a window or changes the
         language should not do it behind a palette still on screen. */
      dismiss();
      match.command.run();
    },
    [matches, selected, dismiss],
  );

  return {
    open,
    query,
    matches,
    selected,
    setQuery,
    move,
    select: setSelected,
    run,
    show,
    dismiss,
  };
}
