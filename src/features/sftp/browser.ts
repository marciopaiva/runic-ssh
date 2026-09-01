/**
 * Pure state for the SFTP workspace: what its transfers are doing.
 *
 * `use-fanout.ts` is the only thing that calls IPC or listens for an event;
 * everything here is a reducer over what those events said, so what a
 * progress event does to the list is testable without a webview, the same
 * split `ssh::registry` draws on the Rust side between "what changed" and
 * "how we heard about it."
 */

import type { IpcErrorCode, TransferHandle, TransferOutcome, TransferProgress } from '../../ipc';
import type { PaneEntry } from './endpoint';

/** `'transfer'` is remote-to-remote (ADR-0045); the other two are the
 * original local↔remote pair, kept for the icon `TransferRow` draws. */
export type TransferDirection = 'download' | 'upload' | 'transfer';
export type TransferStatus = 'active' | 'succeeded' | 'failed' | 'cancelled';

export interface TransferState {
  readonly transfer: TransferHandle;
  readonly direction: TransferDirection;
  /** The file's own name, for the transfers list. Never a full path: the
   * list is about what is moving, not where. */
  readonly name: string;
  /** Which destination this is, for a fan-out of several: `user@host` or
   * `localhost`. Distinguishes otherwise-identical rows when one file goes
   * to more than one place at once. */
  readonly destination: string;
  readonly transferred: number;
  readonly total: number | null;
  readonly status: TransferStatus;
  /** Set only when `status` is `'failed'`. */
  readonly errorCode: IpcErrorCode | null;
}

export type TransferAction =
  | {
      readonly type: 'started';
      readonly transfer: TransferHandle;
      readonly direction: TransferDirection;
      readonly name: string;
      readonly destination: string;
    }
  | { readonly type: 'progress'; readonly transfer: TransferHandle; readonly progress: TransferProgress }
  | { readonly type: 'finished'; readonly transfer: TransferHandle; readonly outcome: TransferOutcome }
  | { readonly type: 'dismissed'; readonly transfer: TransferHandle };

/**
 * Folds one event into the transfer list.
 *
 * A transfer already gone (dismissed, or a stray event after a tab closed
 * and reopened with a stale listener) is a no-op for `progress` and
 * `finished`: nothing to update rather than an entry accidentally revived.
 */
export function reduceTransfers(
  transfers: readonly TransferState[],
  action: TransferAction,
): readonly TransferState[] {
  switch (action.type) {
    case 'started':
      return [
        ...transfers,
        {
          transfer: action.transfer,
          direction: action.direction,
          name: action.name,
          destination: action.destination,
          transferred: 0,
          total: null,
          status: 'active',
          errorCode: null,
        },
      ];

    case 'progress':
      return transfers.map((entry) =>
        entry.transfer === action.transfer
          ? { ...entry, transferred: action.progress.transferred, total: action.progress.total }
          : entry,
      );

    case 'finished':
      return transfers.map((entry) => {
        if (entry.transfer !== action.transfer) return entry;
        if (action.outcome.outcome === 'succeeded') {
          return { ...entry, status: 'succeeded' as const, errorCode: null };
        }

        /* A cancelled transfer is not an error the transfers list shows as
           one: the user asked for this ending, so it is dismissed the same
           quiet way `sftp_cancel` never rejects. */
        const cancelled = action.outcome.error.code === 'sftpTransferCancelled';
        return {
          ...entry,
          status: cancelled ? ('cancelled' as const) : ('failed' as const),
          errorCode: cancelled ? null : action.outcome.error.code,
        };
      });

    case 'dismissed':
      return transfers.filter((entry) => entry.transfer !== action.transfer);
  }
}

/** Whether any transfer in the list is still moving. */
export function hasActiveTransfer(transfers: readonly TransferState[]): boolean {
  return transfers.some((entry) => entry.status === 'active');
}

/**
 * The parent of a POSIX-style remote path, or `null` at the root.
 *
 * SFTP paths are always POSIX-style on the wire regardless of either end's
 * own platform, which is what makes splitting on `/` correct here even on a
 * Windows build. Mirrors `sftp::session::last_segment` on the Rust side,
 * which this is the other half of: that one names a downloaded file, this
 * one names where "up" goes.
 */
export function remoteParent(path: string): string | null {
  const trimmed = path.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return null;

  const at = trimmed.lastIndexOf('/');
  if (at < 0) return '.';
  if (at === 0) return '/';

  return trimmed.slice(0, at);
}

/**
 * How many destination rows the fan-out column renders: exactly `split`,
 * the maintainer's own choice, except never fewer than `occupied`. A row
 * filling in must not grow the split on its own, since that defeats
 * choosing 1 and getting 1; growing past the chosen split is the split
 * control's job, not a drop's. Capped at `max` ({@link MAX_DESTINATIONS}),
 * since occupied can never exceed it either.
 */
export function visibleDestinationRows(split: number, occupied: number, max: number): number {
  return Math.min(max, Math.max(split, occupied));
}

/** One clickable crumb in a pane's nav bar: what it says, and the path
 * clicking it re-enters. */
export interface PathSegment {
  readonly label: string;
  readonly path: string;
}

/**
 * Breadcrumb segments for a pane's current path (ADR-0047).
 *
 * Split on `/`, which is exact for every remote path (always POSIX on the
 * wire, per `remoteParent` above) and correct for a local path on every
 * platform this ships on except Windows, where a path separated by `\`
 * instead comes back as one segment naming the whole thing: coarser
 * information, not wrong information, and not worth a second splitting
 * rule for the one platform that needs it until somebody is looking at it
 * there. `.`, the remote root `sftpList` starts a fresh pane at, has
 * nothing to break into and draws no breadcrumb at all.
 */
export function pathSegments(path: string): readonly PathSegment[] {
  const trimmed = path.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return [];

  const absolute = trimmed.startsWith('/');
  const parts = trimmed.split('/').filter((part) => part.length > 0);

  const segments: PathSegment[] = [];
  let running = '';
  for (const part of parts) {
    running = running === '' ? (absolute ? `/${part}` : part) : `${running}/${part}`;
    segments.push({ label: part, path: running });
  }

  if (absolute) segments.unshift({ label: '/', path: '/' });
  return segments;
}

/**
 * The name a local path's own last segment names, for a file picked through
 * the native dialog (ADR-0042) rather than listed: that path is whatever
 * shape the OS's own picker returns, `/` on every platform this ships on
 * except Windows, which answers in `\` instead. `sftp::session::last_segment`
 * is the same split on the Rust side, for a remote path, which is always
 * POSIX on the wire regardless of either end's own platform and so never
 * needs the second separator this does.
 */
export function localFileName(path: string): string {
  const segments = path.split(/[/\\]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}

/**
 * Which files a shift-click range covers, between `anchor` and `target`
 * inclusive, in `entries`' own displayed order.
 *
 * A directory sitting between the two is skipped rather than included:
 * only a source pane's files are selectable at all, so a folder the range
 * happens to pass over is not part of what got selected, the same way a
 * real file manager's own shift-click range never selects a heading.
 * Neither endpoint found (a stale anchor from a listing that has since
 * changed under it) falls back to selecting just `target`, rather than
 * guessing at a range that no longer means anything.
 */
export function selectionRange(
  entries: readonly PaneEntry[],
  anchor: string,
  target: string,
): readonly string[] {
  const order = entries.map((entry) => entry.path);
  const anchorAt = order.indexOf(anchor);
  const targetAt = order.indexOf(target);
  if (anchorAt === -1 || targetAt === -1) return [target];

  const [start, end] = anchorAt < targetAt ? [anchorAt, targetAt] : [targetAt, anchorAt];
  return entries
    .slice(start, end + 1)
    .filter((entry) => !entry.isDir)
    .map((entry) => entry.path);
}

/** Flips one destination slot's own receive toggle (ADR-0047): a slot
 * absent from the set receives a fan-out, one present in it is spared.
 * The same shape Sessions' own `muted` already is, and for the same
 * reason: arming (occupying a slot) has always started with everyone
 * included, which an empty set gives for free. */
export function toggleReceiving(muted: ReadonlySet<number>, slot: number): ReadonlySet<number> {
  const next = new Set(muted);
  if (next.has(slot)) next.delete(slot);
  else next.add(slot);
  return next;
}
