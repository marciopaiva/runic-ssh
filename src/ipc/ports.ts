/**
 * Typed wrapper over the listening-sockets command.
 *
 * Read-only, matching `ssh/ports.rs`'s own scope: nothing here opens,
 * closes or otherwise touches a socket.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/** One listening socket, named the way `ss` names its own columns. */
export interface ListeningSocket {
  readonly protocol: string;
  readonly state: string;
  readonly address: string;
  readonly port: number;
  /**
   * `ss`'s own raw trailing text for the owning process, not further
   * parsed. Empty when the session lacks privilege to see who owns a
   * socket that belongs to another user, the same reason `ps` only shows
   * every user's own processes without it.
   */
  readonly process: string;
}

/**
 * Lists `handle`'s own listening sockets.
 *
 * A host whose `ss` does not exist yields an empty list rather than a
 * rejection: see `ssh/ports.rs`'s own doc comment for why the two are
 * indistinguishable from here on purpose.
 */
export async function sessionPorts(handle: SessionHandle): Promise<readonly ListeningSocket[]> {
  return invoke<ListeningSocket[]>('session_ports', { handle });
}
