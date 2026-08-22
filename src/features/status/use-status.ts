/**
 * Keeps the status bar's numbers current.
 *
 * State and effects live here rather than in the component, per section 6.
 * The probe is a real request to the host, so this hook is also where the
 * decision to stop making them lives — see `shouldProbe`.
 */

import { useEffect, useState } from 'react';

import { asIpcError, sessionStats } from '../../ipc';
import type { SessionHandle, SessionStats } from '../../ipc';

import { NO_STATS, PROBE_INTERVAL_MS, shouldProbe } from './status';

export function useSessionStats(handle: SessionHandle | null): SessionStats {
  const [stats, setStats] = useState<SessionStats>(NO_STATS);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const update = (): void => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    /* A session that went away should not leave last session's numbers on
       screen, which would read as the new one having already transferred
       something. */
    setStats(NO_STATS);

    if (!shouldProbe(visible, handle)) return;
    /* Narrowed by shouldProbe; this satisfies the compiler without an
       assertion. */
    if (handle === null) return;

    let live = true;

    const probe = async (): Promise<void> => {
      try {
        const next = await sessionStats(handle);
        if (live) setStats(next);
      } catch (rejection) {
        /* A lost probe is not a lost session. Blanking everything because one
           request failed reports something worse than what happened, so only
           the latency goes unknown and the counters stay as they were. */
        const error = asIpcError(rejection);
        if (live && error?.code === 'unknownHandle') setStats(NO_STATS);
        else if (live) setStats((current) => ({ ...current, latencyMs: null }));
      }
    };

    void probe();
    const timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [handle, visible]);

  return stats;
}
