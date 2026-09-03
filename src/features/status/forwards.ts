/**
 * A saved forward's own runtime state, once the session it belongs to has
 * connected.
 *
 * ADR-0054: a saved forward starts the moment its session does, with no
 * separate "arm this forward" gesture, matching OpenSSH's own
 * `LocalForward`/`RemoteForward`/`DynamicForward` directives. This is what
 * that start turns into, per forward, for as long as the session stays
 * open: `starting` the instant the session connects, then `running` or
 * `failed` once the core answers.
 */

import {
  startDynamicForward,
  startLocalForward,
  startRemoteForward,
} from '../../ipc';
import type { Forward, ForwardHandle, IpcError, SessionHandle } from '../../ipc';
import type { ParameterlessKey } from '../../lib/i18n';

export type ForwardRuntime =
  | { readonly kind: 'starting' }
  | { readonly kind: 'running'; readonly handle: ForwardHandle }
  | { readonly kind: 'failed'; readonly error: IpcError };

/** Labelled for `StatusBar`'s own tooltip, one row per saved forward. */
export const FORWARD_STATE_LABEL: Readonly<Record<ForwardRuntime['kind'], ParameterlessKey>> = {
  starting: 'status.forward.starting',
  running: 'status.forward.running',
  failed: 'status.forward.failed',
};

export interface ForwardStatus {
  readonly forward: Forward;
  readonly runtime: ForwardRuntime;
}

/** Every saved forward for a session, marked as just having been asked to
 * start. The order matches `Session.forwards`, which `resolveForward`
 * relies on to update the right row once its own start settles. */
export function startingForwards(forwards: readonly Forward[]): readonly ForwardStatus[] {
  return forwards.map((forward) => ({ forward, runtime: { kind: 'starting' } }));
}

/** `statuses` with the row at `index` moved to its resolved runtime state. */
export function resolveForward(
  statuses: readonly ForwardStatus[],
  index: number,
  runtime: ForwardRuntime,
): readonly ForwardStatus[] {
  return statuses.map((status, at) => (at === index ? { ...status, runtime } : status));
}

/** Whether any forward in the list failed to start. */
export function anyForwardFailed(statuses: readonly ForwardStatus[]): boolean {
  return statuses.some((status) => status.runtime.kind === 'failed');
}

/** Every handle a running forward in the list actually holds, the ones
 * `stopForward` needs when the session that carries them disconnects. */
export function runningForwardHandles(statuses: readonly ForwardStatus[]): readonly ForwardHandle[] {
  return statuses
    .map((status) => status.runtime)
    .filter((runtime): runtime is { kind: 'running'; handle: ForwardHandle } => runtime.kind === 'running')
    .map((runtime) => runtime.handle);
}

/**
 * Starts one saved forward, dispatched by its own kind.
 *
 * `targetHost`/`targetPort` are `null` only for `dynamic` (ADR-0054's own
 * `Forward` shape), which is also the one kind that never reads them here;
 * the fallbacks below are never actually reached for `local`/`remote`, kept
 * only because the type does not by itself rule the pairing out.
 */
export function startForward(handle: SessionHandle, forward: Forward): Promise<ForwardHandle> {
  switch (forward.kind) {
    case 'local':
      return startLocalForward(handle, forward.bindPort, forward.targetHost ?? '', forward.targetPort ?? 0);
    case 'remote':
      return startRemoteForward(handle, forward.bindPort, forward.targetHost ?? '', forward.targetPort ?? 0);
    case 'dynamic':
      return startDynamicForward(handle, forward.bindPort);
  }
}
