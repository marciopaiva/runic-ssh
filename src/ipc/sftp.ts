/**
 * Typed wrapper over the SFTP commands and events.
 *
 * Listing answers directly; a transfer returns a handle immediately and its
 * progress and outcome arrive as events keyed by that handle, the same shape
 * `ipc/terminal.ts` already uses for output. Browsing the local side is
 * `local_list_directory` (ADR-0043).
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
 * name. The path is the user's own, on their own machine.
 */
export async function localListDirectory(path: string | null): Promise<LocalListing> {
  return invoke<LocalListing>('local_list_directory', { path: path ?? undefined });
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
 * Starts a remote-to-remote transfer (ADR-0045). Progress and outcome arrive
 * as events on the handle returned, the same as {@link sftpDownload} and
 * {@link sftpUpload}.
 */
export async function sftpTransfer(
  sourceHandle: SessionHandle,
  sourcePath: string,
  destHandle: SessionHandle,
  destDir: string,
): Promise<TransferHandle> {
  return invoke<TransferHandle>('sftp_transfer', { sourceHandle, sourcePath, destHandle, destDir });
}

/** Creates a directory named `name` inside `dir`, remotely. ADR-0048. */
export async function sftpMkdir(handle: SessionHandle, dir: string, name: string): Promise<string> {
  return invoke<string>('sftp_mkdir', { handle, dir, name });
}

/** Renames `oldName` to `newName`, within `dir`, remotely. ADR-0048. */
export async function sftpRename(
  handle: SessionHandle,
  dir: string,
  oldName: string,
  newName: string,
): Promise<string> {
  return invoke<string>('sftp_rename', { handle, dir, oldName, newName });
}

/** Removes `name` inside `dir`, remotely. A directory is removed
 * recursively. ADR-0048. */
export async function sftpRemove(
  handle: SessionHandle,
  dir: string,
  name: string,
  isDir: boolean,
): Promise<void> {
  return invoke<void>('sftp_remove', { handle, dir, name, isDir });
}

/** Creates a directory named `name` inside `dir`, locally. ADR-0048. */
export async function localMkdir(dir: string, name: string): Promise<string> {
  return invoke<string>('local_mkdir', { dir, name });
}

/** Renames `oldName` to `newName`, within `dir`, locally. ADR-0048. */
export async function localRename(dir: string, oldName: string, newName: string): Promise<string> {
  return invoke<string>('local_rename', { dir, oldName, newName });
}

/** Removes `name` inside `dir`, locally. A directory is removed
 * recursively. ADR-0048. */
export async function localRemove(dir: string, name: string, isDir: boolean): Promise<void> {
  return invoke<void>('local_remove', { dir, name, isDir });
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

export interface TransferProgress {
  readonly transferred: number;
  readonly total: number | null;
}

/** One transfer's own progress batch, named which transfer it is: unlike a
 * per-handle subscription (see {@link onAnyProgress}'s own doc comment for
 * why there no longer is one), a caller filtering several transfers at
 * once has to be told which. */
export interface AnyTransferProgress extends TransferProgress {
  readonly transfer: TransferHandle;
}

/** One transfer's ending, whichever way it went. */
export type TransferOutcome =
  | { readonly outcome: 'succeeded'; readonly path: string }
  | { readonly outcome: 'failed'; readonly error: IpcError };

export type AnyTransferFinished = TransferOutcome & { readonly transfer: TransferHandle };

/**
 * Subscribes to every transfer's progress, named by handle rather than
 * filtered to one.
 *
 * A per-handle filtered subscription used to exist here instead, set up
 * only once a caller already had a handle back from `sftpUpload` and its
 * kin, which is to say only after the transfer had already started. A
 * transfer against a fast local connection can finish, and emit its own
 * `FINISHED_EVENT`, before that later subscription's own round trip to
 * register it completes, and an event nothing was listening for yet is
 * gone, not queued: the promise waiting on it then waits forever. Reported
 * directly, reproduced with a recursive folder copy (ADR-0049) sending
 * several small local files back to back, each one shortening the odds
 * the next subscription wins its own race. One subscription, made once
 * and kept for as long as this window runs, has nothing left to race:
 * it is already listening before any transfer this session starts.
 */
export async function onAnyProgress(onBatch: (progress: AnyTransferProgress) => void): Promise<UnlistenFn> {
  return listen<AnyTransferProgress>(PROGRESS_EVENT, (event) => onBatch(event.payload));
}

/** See {@link onAnyProgress}'s own doc comment: the same subscribe-once
 * reasoning, for the event a caller actually cannot afford to miss. */
export async function onAnyFinished(onDone: (outcome: AnyTransferFinished) => void): Promise<UnlistenFn> {
  return listen<AnyTransferFinished>(FINISHED_EVENT, (event) => onDone(event.payload));
}
