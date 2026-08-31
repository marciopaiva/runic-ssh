/**
 * Binds one SFTP tab to IPC: two directory listings and the transfers moving
 * files between them.
 *
 * `browser.ts` holds everything about this that is a pure question of state;
 * this is the thin remainder, the same split `use-connect.ts` draws between
 * `connect.ts`'s rules and the calls that carry them out.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  chooseUploadSource,
  localListDirectory,
  onFinished,
  onProgress,
  sftpCancel,
  sftpDownload,
  sftpList,
  sftpUpload,
} from '../../ipc';
import type {
  IpcErrorCode,
  LocalEntry,
  SessionHandle,
  SftpEntry,
  TransferHandle,
} from '../../ipc';
import { asIpcError } from '../../ipc';
import { reduceTransfers, remoteParent } from './browser';
import type { TransferState } from './browser';

export interface SftpBrowserState {
  /** `null` only until the first local listing answers. */
  readonly localPath: string | null;
  readonly localEntries: readonly LocalEntry[];
  readonly localParent: string | null;
  readonly localLoading: boolean;
  readonly localError: IpcErrorCode | null;

  readonly remotePath: string;
  readonly remoteEntries: readonly SftpEntry[];
  readonly remoteParent: string | null;
  readonly remoteLoading: boolean;
  readonly remoteError: IpcErrorCode | null;

  readonly transfers: readonly TransferState[];
}

export interface SftpBrowserActions {
  readonly enterLocal: (path: string) => void;
  readonly enterRemote: (path: string) => void;
  readonly goUpLocal: () => void;
  readonly goUpRemote: () => void;
  /** Downloads a remote file into whatever directory the local pane shows. */
  readonly download: (entry: SftpEntry) => void;
  /** Uploads a local file into whatever directory the remote pane shows. */
  readonly upload: (entry: LocalEntry) => void;
  /** Uploads a file chosen through the native picker (ADR-0042), for when
   * the local pane is not showing the file a person wants to send. */
  readonly uploadFromDialog: () => void;
  readonly cancelTransfer: (transfer: TransferHandle) => void;
  readonly dismissTransfer: (transfer: TransferHandle) => void;
}

const START_REMOTE = '.';

export function useSftpBrowser(handle: SessionHandle): SftpBrowserState & SftpBrowserActions {
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<readonly LocalEntry[]>([]);
  const [localParent, setLocalParent] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<IpcErrorCode | null>(null);

  const [remotePath, setRemotePath] = useState(START_REMOTE);
  const [remoteEntries, setRemoteEntries] = useState<readonly SftpEntry[]>([]);
  const [remoteParentPath, setRemoteParentPath] = useState<string | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState<IpcErrorCode | null>(null);

  const [transfers, setTransfers] = useState<readonly TransferState[]>([]);

  /* The listings a transfer's own destination is read from, without putting
     either in the callback's own dependency array: a transfer started from
     a stale closure would send a file to a directory the pane left behind a
     click ago. */
  const localPathRef = useRef(localPath);
  localPathRef.current = localPath;
  const remotePathRef = useRef(remotePath);
  remotePathRef.current = remotePath;

  const loadLocal = useCallback((path: string | null) => {
    setLocalLoading(true);
    setLocalError(null);

    void localListDirectory(path)
      .then((listing) => {
        setLocalPath(listing.path);
        setLocalEntries(listing.entries);
        setLocalParent(listing.parent);
      })
      .catch((rejection: unknown) => {
        setLocalError(asIpcError(rejection)?.code ?? null);
      })
      .finally(() => setLocalLoading(false));
  }, []);

  const loadRemote = useCallback(
    (path: string) => {
      setRemoteLoading(true);
      setRemoteError(null);

      void sftpList(handle, path)
        .then((entries) => {
          setRemotePath(path);
          setRemoteEntries(entries);
          setRemoteParentPath(remoteParent(path));
        })
        .catch((rejection: unknown) => {
          setRemoteError(asIpcError(rejection)?.code ?? null);
        })
        .finally(() => setRemoteLoading(false));
    },
    [handle],
  );

  useEffect(() => {
    loadLocal(null);
    loadRemote(START_REMOTE);
    /* Deliberately once per mount: `handle` does not change under a live
       tab, and re-running this on every render would fight a person's own
       navigation with the starting directory. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* One transfer's whole lifetime: started, every progress event, and the
     one finished event, unsubscribing itself once that arrives. A transfer
     nobody is tracking any more (the tab moved on) still runs to
     completion in the core; only the listener here goes away, the same
     "the pump ends when its channel does" shape `commands::terminal`'s own
     sink follows. */
  const track = useCallback(
    (transfer: TransferHandle, direction: TransferState['direction'], name: string) => {
      setTransfers((current) => reduceTransfers(current, { type: 'started', transfer, direction, name }));

      let unsubProgress: (() => void) | null = null;
      let unsubFinished: (() => void) | null = null;

      void onProgress(transfer, (progress) => {
        setTransfers((current) => reduceTransfers(current, { type: 'progress', transfer, progress }));
      }).then((unlisten) => {
        unsubProgress = unlisten;
      });

      void onFinished(transfer, (outcome) => {
        setTransfers((current) => reduceTransfers(current, { type: 'finished', transfer, outcome }));
        unsubProgress?.();
        unsubFinished?.();

        /* A successful transfer refreshes whichever pane received it, so
           what just landed is visible without a manual reload. */
        if (outcome.outcome === 'succeeded') {
          if (direction === 'download') loadLocal(localPathRef.current);
          else loadRemote(remotePathRef.current);
        }
      }).then((unlisten) => {
        unsubFinished = unlisten;
      });
    },
    [loadLocal, loadRemote],
  );

  const download = useCallback(
    (entry: SftpEntry) => {
      const destination = localPathRef.current;
      if (destination === null || entry.isDir) return;

      void sftpDownload(handle, entry.remotePath, destination).then((transfer) => {
        track(transfer, 'download', entry.name);
      });
    },
    [handle, track],
  );

  const upload = useCallback(
    (entry: LocalEntry) => {
      if (entry.isDir) return;

      void sftpUpload(handle, entry.path, remotePathRef.current).then((transfer) => {
        track(transfer, 'upload', entry.name);
      });
    },
    [handle, track],
  );

  const uploadFromDialog = useCallback(() => {
    void chooseUploadSource().then((path) => {
      if (path === null) return;
      const name = path.split(/[/\\]/).pop() ?? path;

      void sftpUpload(handle, path, remotePathRef.current).then((transfer) => {
        track(transfer, 'upload', name);
      });
    });
  }, [handle, track]);

  const cancelTransfer = useCallback((transfer: TransferHandle) => {
    void sftpCancel(transfer);
  }, []);

  const dismissTransfer = useCallback((transfer: TransferHandle) => {
    setTransfers((current) => reduceTransfers(current, { type: 'dismissed', transfer }));
  }, []);

  return {
    localPath,
    localEntries,
    localParent,
    localLoading,
    localError,
    remotePath,
    remoteEntries,
    remoteParent: remoteParentPath,
    remoteLoading,
    remoteError,
    transfers,
    enterLocal: loadLocal,
    enterRemote: loadRemote,
    goUpLocal: () => {
      if (localParent !== null) loadLocal(localParent);
    },
    goUpRemote: () => {
      if (remoteParentPath !== null) loadRemote(remoteParentPath);
    },
    download,
    upload,
    uploadFromDialog,
    cancelTransfer,
    dismissTransfer,
  };
}

