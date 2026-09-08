/**
 * Keeps one arbitrary log file's own recent tail current.
 *
 * `null` for `handle` means "not looking at this," the same convention
 * `use-unit-journal.ts` uses. `null` for `path` means nothing has been
 * submitted in the Logs tab's own input yet: polling only starts once both
 * a session and a path are picked.
 */

import { useEffect, useState } from 'react';

import { sessionTailFile } from '../../ipc';
import type { SessionHandle } from '../../ipc';

import { MONITOR_INTERVAL_MS } from '../status';

export function useFileTail(handle: SessionHandle | null, path: string | null): readonly string[] {
  const [lines, setLines] = useState<readonly string[]>([]);

  useEffect(() => {
    setLines([]);
    if (handle === null || path === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionTailFile(handle, path);
        if (live) setLines(next);
      } catch {
        /* A lost probe is not a lost session: the lines on screen stay
           exactly as they were rather than emptying over one failed read. */
      }
    };

    void probe();
    const timer = setInterval(() => void probe(), MONITOR_INTERVAL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [handle, path]);

  return lines;
}
