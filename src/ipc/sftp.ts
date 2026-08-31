/**
 * Typed wrapper over the SFTP commands and events.
 *
 * Listing answers directly; a transfer returns a handle immediately and its
 * progress and outcome arrive as events keyed by that handle, the same shape
 * `ipc/terminal.ts` already uses for output. The local half of a transfer is
 * its own pair of commands backed by the native picker (ADR-0042), and
 * browsing the local side at all is `local_list_directory` (ADR-0043).
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

import type { IpcError } from './errors';
import type { SessionHandle } from './sessions';

export const PROGRESS_EVENT = 'sftp://progress';
export const FINISHED_EVENT = 'sftp://finished';

/** An opaque reference to a transfer in flight. Names nothing about it. */
export type TransferHandle = number;

/** One remote directory entry. */
export interface SftpEntry {
  readonly name: string;
  readonly remotePath: string;
  readonly isDir: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
  readonly modifiedUnixSecs: number | null;
}

/** One local directory entry. */
export interface LocalEntry {
  readonly name: string;
  readonly path: string;
  readonly isDir: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
  readonly modifiedUnixSecs: number | null;
}

export interface LocalListing {
  readonly path: string;
  readonly parent: string | null;
  readonly entries: readonly LocalEntry[];
}

/** Lists a remote directory. */
export async function sftpList(handle: SessionHandle, path: string): Promise<readonly SftpEntry[]> {
  return invoke<readonly SftpEntry[]>('sftp_list', { handle, path });
}

/**
 * Lists a local directory, defaulting to the user's home directory.
 *
 * ADR-0043: unlike the remote side, nothing here defends against a hostile
 * name — the path is the user's own, on their own machine.
 */
export async function localListDirectory(path: string | null): Promise<LocalListing> {
  return invoke<LocalListing>('local_list_directory', { path: path ?? undefined });
}

/** Shows the native "choose a folder" dialog. `null` on cancellation. */
export async function chooseDownloadDestination(): Promise<string | null> {
  return invoke<string | null>('sftp_choose_download_destination');
}

/** Shows the native "choose a file" dialog. `null` on cancellation. */
export async function chooseUploadSource(): Promise<string | null> {
  return invoke<string | null>('sftp_choose_upload_source');
}

/** Starts a download. Progress and outcome arrive as events on the handle returned. */
export async function sftpDownload(
  handle: SessionHandle,
  remotePath: string,
  localDir: string,
): Promise<TransferHandle> {
  return invoke<TransferHandle>('sftp_download', { handle, remotePath, localDir });
}

/** Starts an upload. Progress and outcome arrive as events on the handle returned. */
export async function sftpUpload(
  handle: SessionHandle,
  localPath: string,
  remoteDir: string,
): Promise<TransferHandle> {
  return invoke<TransferHandle>('sftp_upload', { handle, localPath, remoteDir });
}

/**
 * Cancels a transfer in flight.
 *
 * Never rejects: a handle naming a transfer already finished, already
 * cancelled, or never issued all mean the same thing to a caller, that
 * transfer is not running, which is already true.
 */
export async function sftpCancel(transfer: TransferHandle): Promise<void> {
  return invoke<void>('sftp_cancel', { transfer });
}

interface ProgressPayload {
  readonly transfer: TransferHandle;
  readonly transferred: number;
  readonly total: number | null;
}

export interface TransferProgress {
  readonly transferred: number;
  readonly total: number | null;
}

/** One transfer's ending, whichever way it went. */
export type TransferOutcome =
  | { readonly outcome: 'succeeded'; readonly path: string }
  | { readonly outcome: 'failed'; readonly error: IpcError };

type FinishedPayload = TransferOutcome & { readonly transfer: TransferHandle };

/**
 * Subscribes to progress for one transfer.
 *
 * The handle filter is applied here rather than by the core, because Tauri
 * events are broadcast to every listener: a second transfer must not receive
 * the first one's progress just because it was listening.
 */
export async function onProgress(
  transfer: TransferHandle,
  onBatch: (progress: TransferProgress) => void,
): Promise<UnlistenFn> {
  return listen<ProgressPayload>(PROGRESS_EVENT, (event) => {
    if (event.payload.transfer !== transfer) return;
    onBatch({ transferred: event.payload.transferred, total: event.payload.total });
  });
}

export async function onFinished(
  transfer: TransferHandle,
  onDone: (outcome: TransferOutcome) => void,
): Promise<UnlistenFn> {
  return listen<FinishedPayload>(FINISHED_EVENT, (event) => {
    if (event.payload.transfer !== transfer) return;
    onDone(event.payload);
  });
}
