/**
 * Typed wrapper over the tail of an arbitrary log file.
 *
 * Read-only, matching `ssh/tail.rs`'s own scope: nothing here rotates or
 * otherwise touches the file, only reads its tail.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/**
 * The last lines `tail` reports for `path`, in the order the host printed
 * them.
 *
 * A path that cannot be read (a permission error, a path that is empty or
 * not absolute, or a host with no `tail` at all) yields an empty list
 * rather than a rejection: see `ssh/tail.rs`'s own doc comment for why the
 * three are indistinguishable from here on purpose.
 */
export async function sessionTailFile(handle: SessionHandle, path: string): Promise<readonly string[]> {
  return invoke<string[]>('session_tail_file', { handle, path });
}
