/**
 * Typed wrapper over the Logs tab's own path suggestions.
 *
 * Read-only, matching `ssh/candidate_logs.rs`'s own scope: files `find`
 * actually located under `/var/log` on this host, not a guess from a
 * service's name.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

export async function sessionCandidateLogs(handle: SessionHandle): Promise<readonly string[]> {
  return invoke<string[]>('session_candidate_logs', { handle });
}
