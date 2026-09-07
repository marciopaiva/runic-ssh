/**
 * Keeps one host's own listening sockets current.
 *
 * `null` for `handle` means "not looking at this," the same convention
 * `use-processes.ts` uses: the caller passes `null` whenever the ports tab
 * is not the one on screen, and polling stops rather than running for a
 * tab nobody is reading.
 */

import { useEffect, useState } from 'react';

import { sessionPorts } from '../../ipc';
import type { ListeningSocket, SessionHandle } from '../../ipc';

import { MONITOR_INTERVAL_MS } from '../status';

export function usePorts(handle: SessionHandle | null): readonly ListeningSocket[] {
  const [ports, setPorts] = useState<readonly ListeningSocket[]>([]);

  useEffect(() => {
    setPorts([]);
    if (handle === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionPorts(handle);
        if (live) setPorts(next);
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

  return ports;
}
