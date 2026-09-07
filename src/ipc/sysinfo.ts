/**
 * Typed wrapper over the sysinfo command.
 *
 * One-shot, unlike `sessionMonitor`: call this once when a host is
 * selected, not on a poll, since none of it changes for the life of a
 * connection.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/** A host's own identity. Every field is independent and `null` when it could not be read. */
export interface SystemInfo {
  readonly osName: string | null;
  readonly kernel: string | null;
  readonly hostname: string | null;
  readonly cpuModel: string | null;
}

export async function sessionSystemInfo(handle: SessionHandle): Promise<SystemInfo> {
  return invoke<SystemInfo>('session_system_info', { handle });
}
