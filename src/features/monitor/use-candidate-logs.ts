/**
 * Keeps the Logs tab's own path suggestions current.
 *
 * `null` for `handle` means "not looking at this," the same convention
 * `use-systemd-units.ts` uses: the caller passes `null` whenever the Logs
 * tab is not the one on screen, and polling stops rather than running for a
 * tab nobody is reading.
 */

import { useEffect, useState } from 'react';

import { sessionCandidateLogs } from '../../ipc';
import type { SessionHandle } from '../../ipc';

import { MONITOR_INTERVAL_MS } from '../status';

export function useCandidateLogs(handle: SessionHandle | null): readonly string[] {
  const [paths, setPaths] = useState<readonly string[]>([]);

  useEffect(() => {
    setPaths([]);
    if (handle === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionCandidateLogs(handle);
        if (live) setPaths(next);
      } catch {
        /* A lost probe is not a lost session: the list on screen stays
           exactly as it was rather than emptying over one failed read. */
      }
    };

    void probe();
    const timer = setInterval(() => void probe(), MONITOR_INTERVAL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [handle]);

  return paths;
}
