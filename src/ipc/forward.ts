/**
 * Typed wrapper over the port forwarding commands.
 *
 * `invoke` appears only in this directory, so the whole IPC surface reads in
 * one place. A component never calls the core directly.
 */

import { invoke } from '@tauri-apps/api/core';

import type { SessionHandle } from './sessions';

/**
 * An opaque reference to a forward in flight, of any of the three kinds
 * (ADR-0054). A number with no meaning outside the core: what the frontend
 * cannot name, it cannot leak.
 */
export type ForwardHandle = number;

/**
 * Starts a local forward (`-L`): `127.0.0.1:bindPort` on this machine,
 * through `handle`'s connection, to `targetHost:targetPort` as that
 * connection's own far end sees it.
 *
 * Returns as soon as the local port is bound. A bind failure (the port is
 * already in use, most often) rejects here, before anything is tracked; a
 * channel the far end refuses happens later, per connection, and ends that
 * one connection rather than the whole forward.
 */
export async function startLocalForward(
  handle: SessionHandle,
  bindPort: number,
  targetHost: string,
  targetPort: number,
): Promise<ForwardHandle> {
  return invoke<ForwardHandle>('start_local_forward', { handle, bindPort, targetHost, targetPort });
}

/**
 * Starts a remote forward (`-R`): asks `handle`'s connection's own far end
 * to listen on `bindPort`, and forwards what it accepts to
 * `targetHost:targetPort` as reachable from this machine.
 *
 * Returns as soon as the server answers. A refusal (no `AllowTcpForwarding`,
 * or a port it will not grant) rejects here, before anything is tracked.
 */
export async function startRemoteForward(
  handle: SessionHandle,
  bindPort: number,
  targetHost: string,
  targetPort: number,
): Promise<ForwardHandle> {
  return invoke<ForwardHandle>('start_remote_forward', { handle, bindPort, targetHost, targetPort });
}

/**
 * Starts a dynamic forward (a SOCKS proxy): `127.0.0.1:bindPort` on this
 * machine, through `handle`'s connection, to wherever each connection's own
 * SOCKS4/SOCKS4a/SOCKS5 handshake names.
 *
 * Returns as soon as the local port is bound, the same shape a local
 * forward's own start takes.
 */
export async function startDynamicForward(handle: SessionHandle, bindPort: number): Promise<ForwardHandle> {
  return invoke<ForwardHandle>('start_dynamic_forward', { handle, bindPort });
}

/**
 * Stops a forward in flight, of any of the three kinds. Never rejects: the
 * core does not fail this when the handle already names nothing, since the
 * caller's goal, that forward not running, is already true.
 */
export async function stopForward(handle: ForwardHandle): Promise<void> {
  return invoke('stop_forward', { handle });
}
