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
import { reduceTransfers } from './browser';
import type { TransferDirection, TransferState } from './browser';
import type { Endpoint, PaneEntry } from './endpoint';

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
}

export interface FanoutActions {
  readonly setSource: (endpoint: Endpoint) => void;
  /** Fills the first empty slot, or does nothing once all
   * {@link MAX_DESTINATIONS} are occupied. */
  readonly addDestination: (endpoint: Endpoint) => void;
  /** Replaces one slot's occupant outright — confirmed directly against
   * this feature, not Sessions' own "the old one becomes a hidden tab"
   * drop behaviour, which does not fit a destination. */
  readonly replaceDestination: (slot: number, endpoint: Endpoint) => void;
  readonly clearDestination: (slot: number) => void;
  readonly reportPane: (paneId: string, report: PaneReport | null) => void;
  readonly sendToDestinations: (entry: PaneEntry) => void;
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

  /* Where each mounted pane currently is, and how to refresh it. A ref, not
     state: nothing renders from this directly, `sendToDestinations` only
     needs whatever the panes most recently reported. */
  const panes = useRef<Map<string, PaneReport>>(new Map());

  const reportPane = useCallback((paneId: string, report: PaneReport | null) => {
    if (report === null) panes.current.delete(paneId);
    else panes.current.set(paneId, report);
  }, []);

  const addDestination = useCallback((endpoint: Endpoint) => {
    setDestinations((current) => {
      const empty = current.indexOf(null);
      if (empty < 0) return current;
      return current.map((slot, at) => (at === empty ? endpoint : slot));
    });
  }, []);

  const replaceDestination = useCallback((slot: number, endpoint: Endpoint) => {
    setDestinations((current) => current.map((occupant, at) => (at === slot ? endpoint : occupant)));
  }, []);

  const clearDestination = useCallback((slot: number) => {
    setDestinations((current) => current.map((occupant, at) => (at === slot ? null : occupant)));
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
     (ADR-0045) — a fan-out of four is four ordinary transfers, not a new
     kind of thing on the wire. */
  const sendToDestinations = useCallback(
    (entry: PaneEntry) => {
      if (source === null || entry.isDir) return;

      destinations.forEach((destination, slot) => {
        if (destination === null) return;
        const pane = panes.current.get(destinationPaneId(slot));
        if (pane?.path == null) return;

        const label = labelFor(destination);
        const started =
          source.kind === 'local' && destination.kind === 'remote'
            ? sftpUpload(destination.handle, entry.path, pane.path).then((transfer) => ({
                transfer,
                direction: 'upload' as const,
              }))
            : source.kind === 'remote' && destination.kind === 'local'
              ? sftpDownload(source.handle, entry.path, pane.path).then((transfer) => ({
                  transfer,
                  direction: 'download' as const,
                }))
              : source.kind === 'remote' && destination.kind === 'remote'
                ? sftpTransfer(source.handle, entry.path, destination.handle, pane.path).then((transfer) => ({
                    transfer,
                    direction: 'transfer' as const,
                  }))
                : null;

        /* local source, local destination: nothing here sends a file to
           itself. Not a supported combination in this first cut. */
        if (started === null) return;

        void started.then(({ transfer, direction }) => {
          track(transfer, direction, entry.name, label, () => pane.reload());
        });
      });
    },
    [source, destinations, labelFor, track],
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
    setSource,
    addDestination,
    replaceDestination,
    clearDestination,
    reportPane,
    sendToDestinations,
    cancelTransfer,
    dismissTransfer,
  };
}
