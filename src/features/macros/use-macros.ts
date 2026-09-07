/**
 * The saved macros.
 *
 * State and effects live here rather than in a component, per section 6.
 * Mirrors `features/sessions/use-sessions.ts`'s own shape: a list loaded
 * once, a failure reported rather than shown as a silent empty list, and
 * `save`/`remove` that reload afterwards so the list is never out of step
 * with what the core actually holds.
 */

import { useCallback, useEffect, useState } from 'react';

import { asIpcError, deleteMacro, listMacros, saveMacro } from '../../ipc';
import type { Macro, MacroDraft } from '../../ipc';

interface MacrosState {
  readonly macros: readonly Macro[];
  /** Set when the macros file could not be read. Never a silent empty list. */
  readonly failure: string | null;
  readonly reload: () => Promise<void>;
  readonly save: (draft: MacroDraft) => Promise<Macro>;
  readonly remove: (id: string) => Promise<void>;
}

export function useMacros(): MacrosState {
  const [macros, setMacros] = useState<readonly Macro[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setMacros(await listMacros());
      setFailure(null);
    } catch (rejection) {
      const error = asIpcError(rejection);
      setFailure(error?.code ?? 'unknown');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (draft: MacroDraft): Promise<Macro> => {
      const saved = await saveMacro(draft);
      await reload();
      return saved;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteMacro(id);
      await reload();
    },
    [reload],
  );

  return { macros, failure, reload, save, remove };
}
