/**
 * Typed wrapper over a systemd unit's own recent journal lines.
 *
 * Read-only, matching `ssh/journal.rs`'s own scope: nothing here rotates,
 * vacuums or otherwise touches the journal, only reads its tail.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/**
 * The last lines `journalctl` reports for `unit`, in the order the host
 * printed them.
 *
 * A unit whose journal cannot be read (a permission error, a unit name that
 * does not look real, or a host with no `journalctl` at all) yields an
 * empty list rather than a rejection: see `ssh/journal.rs`'s own doc
 * comment for why the three are indistinguishable from here on purpose.
 */
export async function sessionUnitJournal(
  handle: SessionHandle,
  unit: string,
): Promise<readonly string[]> {
  return invoke<string[]>('session_unit_journal', { handle, unit });
}
