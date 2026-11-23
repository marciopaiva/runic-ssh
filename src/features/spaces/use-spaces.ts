/**
 * The saved Spaces and which one is in front.
 *
 * State and effects live here rather than in a component, per section 6. The
 * same shape as `features/macros/use-macros.ts`: a list loaded once, a failure
 * reported rather than shown as a silent empty list, and `save` and `remove`
 * that reload so the list never drifts from what the core holds. Which Space is
 * in front is memory only: a window starts in the default Space.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { asIpcError, deleteSpace, listSpaces, saveSpace } from '../../ipc';
import type { Space, SpaceDraft } from '../../ipc';

import { resolveActive } from './scope';

interface SpacesState {
  readonly spaces: readonly Space[];
  /** The Space in front, already checked against what is saved. */
  readonly active: string;
  readonly failure: string | null;
  /** Reads the Spaces again, after something else changed them. */
  readonly reload: () => Promise<void>;
  readonly choose: (id: string) => void;
  readonly save: (draft: SpaceDraft) => Promise<Space>;
  readonly remove: (id: string) => Promise<void>;
}

export function useSpaces(): SpacesState {
  const [spaces, setSpaces] = useState<readonly Space[]>([]);
  const [chosen, setChosen] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setSpaces(await listSpaces());
      setFailure(null);
    } catch (rejection) {
      setFailure(asIpcError(rejection)?.code ?? 'unknown');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (draft: SpaceDraft): Promise<Space> => {
      const saved = await saveSpace(draft);
      await reload();
      return saved;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteSpace(id);
      await reload();
    },
    [reload],
  );

  /* A deleted Space cannot stay in front. Resolved on read, not by an effect,
     so there is no render in which the interface shows a Space that is gone. */
  const active = useMemo(() => resolveActive(chosen, spaces), [chosen, spaces]);

  return { spaces, active, failure, reload, choose: setChosen, save, remove };
}
