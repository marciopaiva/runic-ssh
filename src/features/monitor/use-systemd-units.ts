/**
 * Keeps one host's systemd unit list current.
 *
 * `null` for `handle` means "not looking at this," the same convention
 * `use-system-stats.ts` uses: the caller passes `null` whenever the systemd
 * tab is not the one on screen, and polling stops rather than running for a
 * tab nobody is reading.
 */

import { useEffect, useState } from 'react';

import { sessionSystemdUnits } from '../../ipc';
import type { SessionHandle, SystemdUnit } from '../../ipc';

import { MONITOR_INTERVAL_MS } from '../status';

export function useSystemdUnits(handle: SessionHandle | null): readonly SystemdUnit[] {
  const [units, setUnits] = useState<readonly SystemdUnit[]>([]);

  useEffect(() => {
    setUnits([]);
    if (handle === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionSystemdUnits(handle);
        if (live) setUnits(next);
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

  return units;
}
