/**
 * Keeps one systemd unit's own recent journal lines current.
 *
 * `null` for `handle` means "not looking at this," the same convention
 * `use-systemd-units.ts` uses. `null` for `unit` means nothing is selected
 * in that tab's own unit list yet: polling only starts once both a tab and
 * a unit are picked.
 */

import { useEffect, useState } from 'react';

import { sessionUnitJournal } from '../../ipc';
import type { SessionHandle } from '../../ipc';

import { MONITOR_INTERVAL_MS } from '../status';

export function useUnitJournal(handle: SessionHandle | null, unit: string | null): readonly string[] {
  const [lines, setLines] = useState<readonly string[]>([]);

  useEffect(() => {
    setLines([]);
    if (handle === null || unit === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionUnitJournal(handle, unit);
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
  }, [handle, unit]);

  return lines;
}
