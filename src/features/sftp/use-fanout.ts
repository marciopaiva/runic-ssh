/**
 * The SFTP workspace's orchestration: one source, up to four destinations,
 * and the transfers fanning a file out to whichever of them are occupied
 * (ADR-0045).
 *
 * Each pane (the source, each destination slot) owns its own listing via
 * `usePane`, called inside its own `SftpPane` component instance rather
 * than here, the same reason `SftpBrowser` used to report its remote view
 * up instead of this hook calling `useSftpBrowser` once per handle: a
 * hook cannot be called a variable number of times. `reportPane` is how a
 * mounted pane tells this hook where it currently is and how to make it
 * reload, since fanning a file out needs to know every destination's
 * current directory, and a successful transfer needs to refresh it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  localListDirectory,
  localMkdir,
  onAnyFinished,
  onAnyProgress,
  sftpCancel,
  sftpDownload,
  sftpList,
  sftpMkdir,
  sftpTransfer,
  sftpUpload,
} from '../../ipc';
import type { TransferHandle, TransferOutcome, TransferProgress } from '../../ipc';
import type { LiveSession } from '../sessions/state';
import { groupLabel } from '../terminal';
import { useTranslator } from '../settings';
import { reduceFolderCopies, reduceTransfers, toggleReceiving } from './browser';
import type { FolderCopyState, TransferDirection, TransferState } from './browser';
import { fromLocalEntry, fromRemoteEntry } from './endpoint';
import type { Endpoint, PaneEntry } from './endpoint';

/**
 * Dispatches one file from `source` to `destination`, whichever of the
 * three combinations that pair is (ADR-0045's own shape, named once here
 * instead of three times: `sendToDestinations`' own fan-out and a single
 * targeted send, dragged onto one pane specifically, are the same dispatch
 * repeated a different number of times).
 *
 * `null` for local source, local destination: nothing here sends a file to
 * itself, not a supported combination in this first cut.
 */
function startTransfer(
  source: Endpoint,
  sourcePath: string,
  destination: Endpoint,
  destinationDir: string,
): Promise<{ readonly transfer: TransferHandle; readonly direction: TransferDirection }> | null {
  if (source.kind === 'local' && destination.kind === 'remote') {
    return sftpUpload(destination.handle, sourcePath, destinationDir).then((transfer) => ({
      transfer,
      direction: 'upload' as const,
    }));
  }
  if (source.kind === 'remote' && destination.kind === 'local') {
    return sftpDownload(source.handle, sourcePath, destinationDir).then((transfer) => ({
      transfer,
      direction: 'download' as const,
    }));
  }
  if (source.kind === 'remote' && destination.kind === 'remote') {
    return sftpTransfer(source.handle, sourcePath, destination.handle, destinationDir).then((transfer) => ({
      transfer,
      direction: 'transfer' as const,
    }));
  }
  return null;
}

async function listEntries(source: Endpoint, path: string): Promise<readonly PaneEntry[]> {
  if (source.kind === 'local') {
    const listing = await localListDirectory(path);
    return listing.entries.map(fromLocalEntry);
  }
  const entries = await sftpList(source.handle, path);
  return entries.map(fromRemoteEntry);
}

/** One entry discovered while walking a folder being copied: `relativeDir`
 * is its parent's own path relative to the folder's own root (`''` for a
 * direct child), which is what lets the same entry be joined under
 * whichever directory this copy is landing in on the far side, rather than
 * carrying a source-side path that means nothing there. ADR-0049. */
interface PlannedEntry {
  readonly sourcePath: string;
  readonly relativeDir: string;
  readonly name: string;
  readonly isDir: boolean;
}

/**
 * Walks `rootPath` (a folder just marked for sending) into a flat, ordered
 * plan: every entry it contains, at any depth, each carrying where it
 * belongs relative to the folder's own root. ADR-0049.
 *
 * Walked once and reused across every destination a fan-out sends the same
 * folder to, rather than once per destination: the source tree does not
 * change between them, and re-listing it that many times would cost real
 * round trips for nothing new learned.
 */
async function planFolderCopy(source: Endpoint, rootPath: string): Promise<readonly PlannedEntry[]> {
  const plan: PlannedEntry[] = [];

  const walk = async (path: string, relativeDir: string): Promise<void> => {
    const entries = await listEntries(source, path);
    for (const entry of entries) {
      plan.push({ sourcePath: entry.path, relativeDir, name: entry.name, isDir: entry.isDir });
      if (entry.isDir) {
        await walk(entry.path, relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`);
      }
    }
  };

  await walk(rootPath, '');
  return plan;
}

/** A starting number, not a settled one (ADR-0045's own Decision section). */
export const MAX_DESTINATIONS = 4;

/** What a mounted pane reports up: where it currently is, and how to make
 * it look again after something lands in it. */
export interface PaneReport {
  readonly path: string | null;
  readonly reload: () => void;
}

export interface FanoutState {
  readonly source: Endpoint | null;
  readonly destinations: readonly (Endpoint | null)[];
  readonly transfers: readonly TransferState[];
  /** Every recursive folder copy in flight or just finished (ADR-0049), a
   * sibling list to `transfers` rather than entries inside it: a folder
   * copy has no single `TransferHandle` of its own. */
  readonly folderCopies: readonly FolderCopyState[];
  /** Occupied destination slots spared from a fan-out (ADR-0047). A slot
   * absent from this set receives; one present in it does not. Empty by
   * default, the same "arming starts with everyone included" rule
   * Sessions' own broadcast follows. */
  readonly mutedDestinations: ReadonlySet<number>;
}

export interface FanoutActions {
  readonly setSource: (endpoint: Endpoint) => void;
  /** Fills the first empty slot, or does nothing once all
   * {@link MAX_DESTINATIONS} are occupied. */
  readonly addDestination: (endpoint: Endpoint) => void;
  /** Replaces one slot's occupant outright: confirmed directly against
   * this feature, not Sessions' own "the old one becomes a hidden tab"
   * drop behaviour, which does not fit a destination. */
  readonly replaceDestination: (slot: number, endpoint: Endpoint) => void;
  readonly clearDestination: (slot: number) => void;
  readonly toggleDestinationReceiving: (slot: number) => void;
  /** Includes every occupied destination again: the toolbar's own
   * "select every occupied destination" shortcut (ADR-0047). */
  readonly includeEveryDestination: () => void;
  readonly reportPane: (paneId: string, report: PaneReport | null) => void;
  readonly sendToDestinations: (entry: PaneEntry) => void;
  /** One or more files, dropped onto one destination pane specifically:
   * reaches only that slot, whether or not its own receive toggle spares
   * it from a broadcast `sendToDestinations` run. */
  readonly sendEntriesToDestination: (entries: readonly PaneEntry[], slot: number) => void;
  readonly cancelTransfer: (transfer: TransferHandle) => void;
  readonly dismissTransfer: (transfer: TransferHandle) => void;
  /** Stops a folder copy after whichever file is currently in flight
   * finishes, and dispatches no more. ADR-0049. */
  readonly cancelFolderCopy: (id: string) => void;
  readonly dismissFolderCopy: (id: string) => void;
}

export const SOURCE_PANE_ID = 'source';
export function destinationPaneId(slot: number): string {
  return `destination-${String(slot)}`;
}

export function useFanout(sessions: readonly LiveSession[]): FanoutState & FanoutActions {
  const i18n = useTranslator();
  const [source, setSource] = useState<Endpoint | null>(null);
  const [destinations, setDestinations] = useState<readonly (Endpoint | null)[]>(
    Array.from({ length: MAX_DESTINATIONS }, () => null),
  );
  const [transfers, setTransfers] = useState<readonly TransferState[]>([]);
  const [folderCopies, setFolderCopies] = useState<readonly FolderCopyState[]>([]);
  const [mutedDestinations, setMutedDestinations] = useState<ReadonlySet<number>>(new Set());
  /* One entry per folder copy in flight: whether it has been asked to
     stop, and the handle of whichever single file it is transferring at
     this moment (ADR-0049 runs one file at a time within a copy), so
     cancelling reaches the transfer actually in flight rather than only
     stopping the walk from starting another. A ref, not state: nothing
     renders from this directly. */
  const folderCopyControl = useRef<Map<string, { cancelled: boolean; current: TransferHandle | null }>>(new Map());
  const nextCopyId = useRef(0);

  /* Where each mounted pane currently is, and how to refresh it. A ref, not
     state: nothing renders from this directly, `sendToDestinations` only
     needs whatever the panes most recently reported. */
  const panes = useRef<Map<string, PaneReport>>(new Map());

  /* Who is waiting for which transfer's own progress or ending, and any
     ending that arrived before anyone asked (see `onAnyFinished`'s own
     doc comment): held rather than dropped, since a fast local transfer
     can finish before this side even learns its own handle back. Two
     refs plus a subscription made once, at mount, rather than the
     handle-filtered subscription-per-transfer this used to be: that one
     raced the transfer it was meant to watch, since it could only be set
     up after a handle already existed, by which point a fast enough
     transfer had already finished and said so to nobody. */
  const progressWatchers = useRef<Map<TransferHandle, (progress: TransferProgress) => void>>(new Map());
  const finishedWatchers = useRef<Map<TransferHandle, (outcome: TransferOutcome) => void>>(new Map());
  const unclaimedFinished = useRef<Map<TransferHandle, TransferOutcome>>(new Map());

  useEffect(() => {
    let disposed = false;
    let unsubProgress: (() => void) | null = null;
    let unsubFinished: (() => void) | null = null;

    void onAnyProgress((event) => {
      progressWatchers.current.get(event.transfer)?.({ transferred: event.transferred, total: event.total });
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      unsubProgress = unlisten;
    });

    void onAnyFinished((event) => {
      const { transfer, ...outcome } = event;
      const watcher = finishedWatchers.current.get(transfer);
      if (watcher !== undefined) {
        finishedWatchers.current.delete(transfer);
        watcher(outcome);
      } else {
        unclaimedFinished.current.set(transfer, outcome);
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      unsubFinished = unlisten;
    });

    return () => {
      disposed = true;
      unsubProgress?.();
      unsubFinished?.();
    };
  }, []);

  /** Resolves with `transfer`'s own ending, from the unclaimed map if it
   * already arrived, otherwise once `onAnyFinished` above delivers it. */
  const waitForFinished = useCallback((transfer: TransferHandle): Promise<TransferOutcome> => {
    const already = unclaimedFinished.current.get(transfer);
    if (already !== undefined) {
      unclaimedFinished.current.delete(transfer);
      return Promise.resolve(already);
    }
    return new Promise((resolve) => {
      finishedWatchers.current.set(transfer, resolve);
    });
  }, []);

  const reportPane = useCallback((paneId: string, report: PaneReport | null) => {
    if (report === null) panes.current.delete(paneId);
    else panes.current.set(paneId, report);
  }, []);

  /* Occupying a slot, however it happens, always starts it receiving:
     "arming starts with everyone included" (ADR-0019), read onto a single
     slot rather than the whole broadcast. */
  const include = useCallback((slot: number) => {
    setMutedDestinations((current) => {
      if (!current.has(slot)) return current;
      const next = new Set(current);
      next.delete(slot);
      return next;
    });
  }, []);

  const addDestination = useCallback(
    (endpoint: Endpoint) => {
      setDestinations((current) => {
        const empty = current.indexOf(null);
        if (empty < 0) return current;
        include(empty);
        return current.map((slot, at) => (at === empty ? endpoint : slot));
      });
    },
    [include],
  );

  const replaceDestination = useCallback(
    (slot: number, endpoint: Endpoint) => {
      include(slot);
      setDestinations((current) => current.map((occupant, at) => (at === slot ? endpoint : occupant)));
    },
    [include],
  );

  const clearDestination = useCallback(
    (slot: number) => {
      include(slot);
      setDestinations((current) => current.map((occupant, at) => (at === slot ? null : occupant)));
    },
    [include],
  );

  const toggleDestinationReceiving = useCallback((slot: number) => {
    setMutedDestinations((current) => toggleReceiving(current, slot));
  }, []);

  const includeEveryDestination = useCallback(() => {
    setMutedDestinations(new Set());
  }, []);

  const labelFor = useCallback(
    (endpoint: Endpoint): string => {
      if (endpoint.kind === 'local') return i18n.t('sftp.localhost');
      const live = sessions.find((entry) => entry.session.id === endpoint.sessionId);
      return live === undefined ? endpoint.sessionId : groupLabel(live.session).where;
    },
    [sessions, i18n],
  );

  const track = useCallback(
    (transfer: TransferHandle, direction: TransferDirection, name: string, destination: string, onDone: () => void) => {
      setTransfers((current) => reduceTransfers(current, { type: 'started', transfer, direction, name, destination }));

      progressWatchers.current.set(transfer, (progress) => {
        setTransfers((current) => reduceTransfers(current, { type: 'progress', transfer, progress }));
      });

      void waitForFinished(transfer).then((outcome) => {
        progressWatchers.current.delete(transfer);
        setTransfers((current) => reduceTransfers(current, { type: 'finished', transfer, outcome }));
        if (outcome.outcome === 'succeeded') onDone();
      });
    },
    [waitForFinished],
  );

  /* Runs one recursive folder copy to completion (or until cancelled): the
     copied folder's own directory first (named after itself, the way
     dragging a folder in any real file manager lands a folder at the far
     end, never its contents poured loose into whatever it was dropped
     on), then every other directory inside it, so a file never tries to
     land in one that does not exist yet, one file transferred at a time
     (ADR-0049's own choice, simpler to reason about than several at once,
     revisited only if a real large tree shows it mattering). A directory
     this application could not create is not treated as fatal: the files
     meant for it fail on their own when they try to land somewhere that
     was never made, each counted the same way any other failed file is,
     rather than this function trying to guess how many of `plan` a
     failed `mkdir` took down with it. */
  const runFolderCopy = useCallback(
    (
      id: string,
      name: string,
      plan: readonly PlannedEntry[],
      source: Endpoint,
      destination: Endpoint,
      destParentDir: string,
      reload: () => void,
    ) => {
      const control: { cancelled: boolean; current: TransferHandle | null } = { cancelled: false, current: null };
      folderCopyControl.current.set(id, control);

      const recordFileDone = (succeeded: boolean): void => {
        if (control.cancelled) return;
        setFolderCopies((current) => reduceFolderCopies(current, { type: 'fileDone', id, succeeded }));
      };

      void (async () => {
        try {
          if (destination.kind === 'local') await localMkdir(destParentDir, name);
          else await sftpMkdir(destination.handle, destParentDir, name);
        } catch {
          /* Best-effort, same reasoning as any other directory below. */
        }
        const destRootDir = `${destParentDir}/${name}`;

        for (const item of plan) {
          if (control.cancelled) break;
          const destDir = item.relativeDir === '' ? destRootDir : `${destRootDir}/${item.relativeDir}`;

          if (item.isDir) {
            try {
              if (destination.kind === 'local') await localMkdir(destDir, item.name);
              else await sftpMkdir(destination.handle, destDir, item.name);
            } catch {
              /* Best-effort; see this function's own doc comment. */
            }
            continue;
          }

          const started = startTransfer(source, item.sourcePath, destination, destDir);
          if (started === null) {
            recordFileDone(false);
            continue;
          }

          try {
            const { transfer } = await started;
            control.current = transfer;
            const outcome = await waitForFinished(transfer);
            control.current = null;
            recordFileDone(outcome.outcome === 'succeeded');
          } catch {
            control.current = null;
            recordFileDone(false);
          }
        }

        folderCopyControl.current.delete(id);
        setFolderCopies((current) =>
          reduceFolderCopies(current, { type: control.cancelled ? 'cancelled' : 'finished', id }),
        );
        reload();
      })();
    },
    [waitForFinished],
  );

  /* One read from the source, one write to every occupied destination,
     issued together rather than one after another: `Promise.all` over the
     per-destination IPC calls below, so a slow destination does not delay
     starting the others. Each destination is its own `TransferHandle`
     (ADR-0045): a fan-out of four is four ordinary transfers, not a new
     kind of thing on the wire. A folder is walked once (`planFolderCopy`)
     and the same plan reused for every destination, rather than walked
     once per destination (ADR-0049): the source tree is the same fan-out
     to fan-out. */
  const sendToDestinations = useCallback(
    (entry: PaneEntry) => {
      if (source === null) return;

      if (entry.isDir) {
        void planFolderCopy(source, entry.path).then((plan) => {
          const total = plan.filter((item) => !item.isDir).length;
          destinations.forEach((destination, slot) => {
            if (destination === null || mutedDestinations.has(slot)) return;
            const pane = panes.current.get(destinationPaneId(slot));
            if (pane === undefined || pane.path === null) return;
            const destDir = pane.path;

            const id = `folder-${String(nextCopyId.current)}`;
            nextCopyId.current += 1;
            const label = labelFor(destination);
            setFolderCopies((current) =>
              reduceFolderCopies(current, { type: 'started', id, name: entry.name, destination: label, total }),
            );
            runFolderCopy(id, entry.name, plan, source, destination, destDir, () => pane.reload());
          });
        });
        return;
      }

      destinations.forEach((destination, slot) => {
        if (destination === null || mutedDestinations.has(slot)) return;
        const pane = panes.current.get(destinationPaneId(slot));
        if (pane?.path == null) return;

        const started = startTransfer(source, entry.path, destination, pane.path);
        if (started === null) return;

        const label = labelFor(destination);
        void started.then(({ transfer, direction }) => {
          track(transfer, direction, entry.name, label, () => pane.reload());
        });
      });
    },
    [source, destinations, mutedDestinations, labelFor, track, runFolderCopy],
  );

  /* Dropped directly onto one pane rather than checked and sent to every
   * receiving destination: a deliberate, targeted request that reaches
   * this one slot whether or not its own receive toggle currently spares
   * it from the broadcast `sendToDestinations` runs. Dragging a file onto
   * a specific pane and having it not land there because that pane was
   * quietly spared would read as broken, not as the toggle working. */
  const sendEntriesToDestination = useCallback(
    (entries: readonly PaneEntry[], slot: number) => {
      if (source === null) return;
      const destination = destinations[slot];
      if (destination === undefined || destination === null) return;
      const pane = panes.current.get(destinationPaneId(slot));
      if (pane?.path == null) return;
      const destDir = pane.path;

      const label = labelFor(destination);
      for (const entry of entries) {
        if (entry.isDir) {
          void planFolderCopy(source, entry.path).then((plan) => {
            const total = plan.filter((item) => !item.isDir).length;
            const id = `folder-${String(nextCopyId.current)}`;
            nextCopyId.current += 1;
            setFolderCopies((current) =>
              reduceFolderCopies(current, { type: 'started', id, name: entry.name, destination: label, total }),
            );
            runFolderCopy(id, entry.name, plan, source, destination, destDir, () => pane.reload());
          });
          continue;
        }
        const started = startTransfer(source, entry.path, destination, pane.path);
        if (started === null) continue;

        void started.then(({ transfer, direction }) => {
          track(transfer, direction, entry.name, label, () => pane.reload());
        });
      }
    },
    [source, destinations, labelFor, track, runFolderCopy],
  );

  const cancelTransfer = useCallback((transfer: TransferHandle) => {
    void sftpCancel(transfer);
  }, []);

  const dismissTransfer = useCallback((transfer: TransferHandle) => {
    setTransfers((current) => reduceTransfers(current, { type: 'dismissed', transfer }));
  }, []);

  const cancelFolderCopy = useCallback((id: string) => {
    const control = folderCopyControl.current.get(id);
    if (control === undefined) return;
    control.cancelled = true;
    if (control.current !== null) void sftpCancel(control.current);
  }, []);

  const dismissFolderCopy = useCallback((id: string) => {
    setFolderCopies((current) => reduceFolderCopies(current, { type: 'dismissed', id }));
  }, []);

  return {
    source,
    destinations,
    transfers,
    folderCopies,
    mutedDestinations,
    setSource,
    addDestination,
    replaceDestination,
    clearDestination,
    toggleDestinationReceiving,
    includeEveryDestination,
    reportPane,
    sendToDestinations,
    sendEntriesToDestination,
    cancelTransfer,
    dismissTransfer,
    cancelFolderCopy,
    dismissFolderCopy,
  };
}
