/**
 * Keeps one host's own busiest processes current.
 *
 * `null` for `handle` means "not looking at this," the same convention
 * `use-systemd-units.ts` uses: the caller passes `null` whenever the
 * processes tab is not the one on screen, and polling stops rather than
 * running for a tab nobody is reading.
 */

import { useEffect, useState } from 'react';

import { sessionProcesses } from '../../ipc';
import type { Process, SessionHandle } from '../../ipc';

import { MONITOR_INTERVAL_MS } from '../status';

export function useProcesses(handle: SessionHandle | null): readonly Process[] {
  const [processes, setProcesses] = useState<readonly Process[]>([]);

  useEffect(() => {
    setProcesses([]);
    if (handle === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionProcesses(handle);
        if (live) setProcesses(next);
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

  return processes;
}
