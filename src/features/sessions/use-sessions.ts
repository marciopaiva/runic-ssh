/**
 * The saved sessions, and what each one is doing.
 *
 * State and effects live here rather than in a component, per section 6. What
 * the sidebar receives is a list it can render and nothing it has to compute.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { asIpcError, listSessions } from '../../ipc';
import type { Session, SessionHandle } from '../../ipc';

import type { ConnectionKind, LiveSession } from './state';

interface SessionsState {
  readonly sessions: readonly LiveSession[];
  /** Set when the session file could not be read. Never a silent empty list. */
  readonly failure: string | null;
  readonly reload: () => Promise<void>;
  readonly setState: (sessionId: string, kind: ConnectionKind) => void;
  readonly attach: (sessionId: string, handle: SessionHandle | null) => void;
}

export function useSessions(): SessionsState {
  const [saved, setSaved] = useState<readonly Session[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [live, setLive] = useState<
    Readonly<Record<string, { kind: ConnectionKind; handle: SessionHandle | null }>>
  >({});

  const reload = useCallback(async (): Promise<void> => {
    try {
      setSaved(await listSessions());
      setFailure(null);
    } catch (rejection) {
      /* An empty sidebar and a broken sidebar look identical, and one of them
         means the user's saved hosts are still there. Say which it is. */
      const error = asIpcError(rejection);
      setFailure(error?.code ?? 'unknown');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setState = useCallback((sessionId: string, kind: ConnectionKind): void => {
    setLive((current) => ({
      ...current,
      [sessionId]: { kind, handle: current[sessionId]?.handle ?? null },
    }));
  }, []);

  const attach = useCallback((sessionId: string, handle: SessionHandle | null): void => {
    setLive((current) => ({
      ...current,
      [sessionId]: { kind: current[sessionId]?.kind ?? 'saved', handle },
    }));
  }, []);

  const sessions = useMemo<readonly LiveSession[]>(
    () =>
      saved.map((session) => ({
        session,
        handle: live[session.id]?.handle ?? null,
        /* A session nobody has touched is saved, not connected. Defaulting to
           anything else would show a state the core never reported. */
        kind: live[session.id]?.kind ?? 'saved',
      })),
    [saved, live],
  );

  return { sessions, failure, reload, setState, attach };
}
