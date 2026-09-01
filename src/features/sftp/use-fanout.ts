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

import { useCallback, useRef, useState } from 'react';

import {
  chooseUploadSource,
  onFinished,
  onProgress,
  sftpCancel,
  sftpDownload,
  sftpTransfer,
  sftpUpload,
} from '../../ipc';
import type { TransferHandle } from '../../ipc';
import type { LiveSession } from '../sessions/state';
import { groupLabel } from '../terminal';
import { useTranslator } from '../settings';
import { localFileName, reduceTransfers, toggleReceiving } from './browser';
import type { TransferDirection, TransferState } from './browser';
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
  /** The native "choose a file" dialog, aimed at one destination without
   * needing a source pane set up at all. */
  readonly uploadFromDialogTo: (slot: number) => void;
  readonly cancelTransfer: (transfer: TransferHandle) => void;
  readonly dismissTransfer: (transfer: TransferHandle) => void;
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
  const [mutedDestinations, setMutedDestinations] = useState<ReadonlySet<number>>(new Set());

  /* Where each mounted pane currently is, and how to refresh it. A ref, not
     state: nothing renders from this directly, `sendToDestinations` only
     needs whatever the panes most recently reported. */
  const panes = useRef<Map<string, PaneReport>>(new Map());

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
        if (outcome.outcome === 'succeeded') onDone();
      }).then((unlisten) => {
        unsubFinished = unlisten;
      });
    },
    [],
  );

  /* One read from the source, one write to every occupied destination,
     issued together rather than one after another: `Promise.all` over the
     per-destination IPC calls below, so a slow destination does not delay
     starting the others. Each destination is its own `TransferHandle`
     (ADR-0045): a fan-out of four is four ordinary transfers, not a new
     kind of thing on the wire. */
  const sendToDestinations = useCallback(
    (entry: PaneEntry) => {
      if (source === null || entry.isDir) return;

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
    [source, destinations, mutedDestinations, labelFor, track],
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

      const label = labelFor(destination);
      for (const entry of entries) {
        if (entry.isDir) continue;
        const started = startTransfer(source, entry.path, destination, pane.path);
        if (started === null) continue;

        void started.then(({ transfer, direction }) => {
          track(transfer, direction, entry.name, label, () => pane.reload());
        });
      }
    },
    [source, destinations, labelFor, track],
  );

  /* The native "choose a file" dialog (ADR-0042), aimed at one destination
   * directly rather than at browsing a local source pane first: a
   * shortcut for "send this one file here" that needs no source pane set
   * up at all. Remote destinations only, the same restriction
   * `startTransfer` already enforces for local-to-local. */
  const uploadFromDialogTo = useCallback(
    (slot: number) => {
      const destination = destinations[slot];
      if (destination === undefined || destination === null || destination.kind !== 'remote') return;

      const label = labelFor(destination);
      /* The pane's own path is read fresh once the dialog answers, not
         captured before it opened: a native dialog holds the OS's own
         focus for as long as it is up, so nothing in this window can
         navigate meanwhile, but there is no reason to rely on that when
         reading it late costs nothing. */
      void chooseUploadSource().then((path) => {
        if (path === null) return;
        const pane = panes.current.get(destinationPaneId(slot));
        if (pane?.path == null) return;

        void sftpUpload(destination.handle, path, pane.path).then((transfer) => {
          track(transfer, 'upload', localFileName(path), label, () => pane.reload());
        });
      });
    },
    [destinations, labelFor, track],
  );

  const cancelTransfer = useCallback((transfer: TransferHandle) => {
    void sftpCancel(transfer);
  }, []);

  const dismissTransfer = useCallback((transfer: TransferHandle) => {
    setTransfers((current) => reduceTransfers(current, { type: 'dismissed', transfer }));
  }, []);

  return {
    source,
    destinations,
    transfers,
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
    uploadFromDialogTo,
    cancelTransfer,
    dismissTransfer,
  };
}
