/**
 * Binds one pane (the source, or one destination slot) to whichever
 * endpoint it currently shows.
 *
 * One hook per pane rather than one hook owning a fixed local+remote pair,
 * the way #127's original `useSftpBrowser` did: ADR-0045 needs as many
 * independently-navigable listings as there are occupied slots, not two.
 * A pane's caller remounts it (via a `key` built from `endpointKey`) when
 * its endpoint changes, so this hook never has to detect that itself —
 * a fresh mount already starts from a clean, empty listing.
 *
 * No ancestor tree here, unlike #127's remote side: with several remote
 * panes possibly open at once, a tree sidebar would have to pick one of
 * them to describe, which is exactly the kind of "whose state is this"
 * question ADR-0045 removes by giving every pane its own inline listing
 * instead. Navigating is a row click or the `..` entry, the same way the
 * local pane always worked.
 */

import { useCallback, useEffect, useState } from 'react';

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
}

export interface PaneActions {
  readonly enter: (path: string | null) => void;
  readonly goUp: () => void;
}

const START_REMOTE = '.';

export function usePane(endpoint: Endpoint): PaneState & PaneActions {
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly PaneEntry[]>([]);
  const [parent, setParent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<IpcErrorCode | null>(null);

  const load = useCallback(
    (requested: string | null) => {
      setLoading(true);
      setError(null);

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
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    path,
    entries,
    parent,
    loading,
    error,
    enter: load,
    goUp: () => {
      if (parent !== null) load(parent);
    },
  };
}
