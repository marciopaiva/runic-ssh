/**
 * Binds one pane (the source, or one destination slot) to whichever
 * endpoint it currently shows.
 *
 * One hook per pane rather than one hook owning a fixed local+remote pair,
 * the way #127's original `useSftpBrowser` did: ADR-0045 needs as many
 * independently-navigable listings as there are occupied slots, not two.
 * A pane's caller remounts it (via a `key` built from `endpointKey`) when
 * its endpoint changes, so this hook never has to detect that itself: a
 * fresh mount already starts from a clean, empty listing.
 *
 * No ancestor tree here, unlike #127's remote side: with several remote
 * panes possibly open at once, a tree sidebar would have to pick one of
 * them to describe, which is exactly the kind of "whose state is this"
 * question ADR-0045 removes by giving every pane its own inline listing
 * instead. Navigating is a row click or the `..` entry, the same way the
 * local pane always worked.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { asIpcError, localListDirectory, sftpList } from '../../ipc';
import type { IpcErrorCode } from '../../ipc';
import type { Endpoint } from './endpoint';
import { fromLocalEntry, fromRemoteEntry } from './endpoint';
import type { PaneEntry } from './endpoint';
import { remoteParent } from './browser';

export interface PaneState {
  /** `null` only until the first listing answers. */
  readonly path: string | null;
  readonly entries: readonly PaneEntry[];
  readonly parent: string | null;
  readonly loading: boolean;
  readonly error: IpcErrorCode | null;
  /** Paths this pane was at before, most recently left last. ADR-0047:
   * back only, no forward, which is the one direction the nav bar draws. */
  readonly history: readonly string[];
}

export interface PaneActions {
  readonly enter: (path: string | null) => void;
  readonly goUp: () => void;
  /** Returns to the last entry in `history`, without pushing anything: a
   * back that could itself be gone back from would need forward too, which
   * ADR-0047 does not draw. */
  readonly back: () => void;
}

const START_REMOTE = '.';

export function usePane(endpoint: Endpoint): PaneState & PaneActions {
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly PaneEntry[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<IpcErrorCode | null>(null);
  const [history, setHistory] = useState<readonly string[]>([]);
  /* `navigate` has to stay a stable reference (the mount effect below and
     `reload` in `App.tsx`'s `reportPane` close over it once), so the path
     being left is read from here rather than from `path` state, which
     would otherwise have to be a dependency. */
  const pathRef = useRef<string | null>(null);

  const navigate = useCallback(
    (requested: string | null, record: boolean) => {
      setLoading(true);
      setError(null);
      const leaving = pathRef.current;

      const listing =
        endpoint.kind === 'local'
          ? localListDirectory(requested).then((result) => ({
              path: result.path,
              parent: result.parent,
              entries: result.entries.map(fromLocalEntry),
            }))
          : sftpList(endpoint.handle, requested ?? START_REMOTE).then((result) => {
              const resolved = requested ?? START_REMOTE;
              return { path: resolved, parent: remoteParent(resolved), entries: result.map(fromRemoteEntry) };
            });

      void listing
        .then((result) => {
          /* Only on an actual move, and only once it is known to have
             succeeded: a refresh (`reload` asking for the path it is
             already at) or a failed navigation must not leave a dead end
             in the back stack. */
          if (record && leaving !== null && leaving !== result.path) {
            setHistory((current) => [...current, leaving]);
          }
          pathRef.current = result.path;
          setPath(result.path);
          setEntries(result.entries);
          setParent(result.parent);
        })
        .catch((rejection: unknown) => {
          setError(asIpcError(rejection)?.code ?? null);
        })
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    navigate(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    path,
    entries,
    parent,
    loading,
    error,
    history,
    enter: (requested) => navigate(requested, true),
    goUp: () => {
      if (parent !== null) navigate(parent, true);
    },
    back: () => {
      const target = history.at(-1);
      if (target === undefined) return;
      setHistory((current) => current.slice(0, -1));
      navigate(target, false);
    },
  };
}
