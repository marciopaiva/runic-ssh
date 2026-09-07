/**
 * Keeps a session's own vital signs current.
 *
 * `use-status.ts`'s own reasoning, once more for a different reading: the
 * probe is a real request to the host, which is why the decision to stop
 * making one lives here too.
 */

import { useEffect, useState } from 'react';

import { asIpcError, sessionMonitor } from '../../ipc';
import type { SessionHandle, SystemStats } from '../../ipc';

import { MONITOR_INTERVAL_MS, NO_SYSTEM_STATS, shouldProbe } from './status';

export function useSystemStats(handle: SessionHandle | null): SystemStats {
  const [stats, setStats] = useState<SystemStats>(NO_SYSTEM_STATS);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const update = (): void => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    /* A session that went away should not leave the last one's readings on
       screen, which would read as this session having whatever CPU load the
       previous one did. */
    setStats(NO_SYSTEM_STATS);

    if (!shouldProbe(visible, handle)) return;
    /* Narrowed by shouldProbe; this satisfies the compiler without an
       assertion. */
    if (handle === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionMonitor(handle);
        if (live) setStats(next);
      } catch (rejection) {
        /* A lost probe is not a lost session, the same reasoning
           `useSessionStats` applies to a lost latency reading: only a
           session that is actually gone blanks what is on screen, and
           anything else leaves the last known reading up rather than
           reporting a healthy host as suddenly unmeasured. */
        const error = asIpcError(rejection);
        if (live && error?.code === 'unknownHandle') setStats(NO_SYSTEM_STATS);
      }
    };

    void probe();
    const timer = setInterval(() => void probe(), MONITOR_INTERVAL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [handle, visible]);

  return stats;
}
