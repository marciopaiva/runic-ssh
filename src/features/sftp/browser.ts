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
