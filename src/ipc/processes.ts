/**
 * Typed wrapper over the process list command.
 *
 * Read-only, matching `ssh/processes.rs`'s own scope: nothing here kills or
 * renices anything.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/** One line of the host's own busiest processes, named the way `ps` names its columns. */
export interface Process {
  readonly pid: number;
  readonly user: string;
  readonly cpuPercent: number;
  readonly memPercent: number;
  readonly command: string;
}

/**
 * Lists `handle`'s own busiest processes.
 *
 * A host whose `ps` does not understand the command yields an empty list
 * rather than a rejection: see `ssh/processes.rs`'s own doc comment for why
 * the two are indistinguishable from here on purpose.
 */
export async function sessionProcesses(handle: SessionHandle): Promise<readonly Process[]> {
  return invoke<Process[]>('session_processes', { handle });
}
