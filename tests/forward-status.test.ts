/**
 * Guards the per-forward runtime state a connected session carries
 * (ADR-0054): starting, then running or failed, one row per saved forward.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  anyForwardFailed,
  resolveForward,
  runningForwardHandles,
  startForward,
  startingForwards,
} from '../src/features/status/forwards';
import type { Forward } from '../src/ipc';

const startLocalForward = vi.fn(async (_handle: number, _bindPort: number, _targetHost: string, _targetPort: number) => 1);
const startRemoteForward = vi.fn(async (_handle: number, _bindPort: number, _targetHost: string, _targetPort: number) => 2);
const startDynamicForward = vi.fn(async (_handle: number, _bindPort: number) => 3);

vi.mock('../src/ipc', () => ({
  startLocalForward: (
    handle: number,
    bindPort: number,
    targetHost: string,
    targetPort: number,
  ) => startLocalForward(handle, bindPort, targetHost, targetPort),
  startRemoteForward: (
    handle: number,
    bindPort: number,
    targetHost: string,
    targetPort: number,
  ) => startRemoteForward(handle, bindPort, targetHost, targetPort),
  startDynamicForward: (handle: number, bindPort: number) => startDynamicForward(handle, bindPort),
}));

const local: Forward = {
  kind: 'local',
  bindPort: 8080,
  targetHost: 'target.internal',
  targetPort: 80,
  name: 'web',
};
const remote: Forward = { ...local, kind: 'remote', bindPort: 9000 };
const dynamic: Forward = { kind: 'dynamic', bindPort: 1080, targetHost: null, targetPort: null, name: null };

describe('starting a list of saved forwards', () => {
  it('marks every row as starting, in order', () => {
    expect(startingForwards([local, remote, dynamic])).toEqual([
      { forward: local, runtime: { kind: 'starting' } },
      { forward: remote, runtime: { kind: 'starting' } },
      { forward: dynamic, runtime: { kind: 'starting' } },
    ]);
  });

  it('is empty for a session with none saved', () => {
    expect(startingForwards([])).toEqual([]);
  });
});

describe('resolving one row once its own start settles', () => {
  it('moves only the row at that index', () => {
    const statuses = startingForwards([local, remote]);
    const resolved = resolveForward(statuses, 0, { kind: 'running', handle: 7 });

    expect(resolved[0]?.runtime).toEqual({ kind: 'running', handle: 7 });
    expect(resolved[1]?.runtime).toEqual({ kind: 'starting' });
  });

  it('leaves every other row exactly as it was', () => {
    const statuses = startingForwards([local, remote, dynamic]);
    const resolved = resolveForward(statuses, 1, { kind: 'failed', error: { code: 'forwardBindFailed', port: 9000 } });

    expect(resolved[0]).toBe(statuses[0]);
    expect(resolved[2]).toBe(statuses[2]);
  });
});

describe('whether any forward failed', () => {
  it('is false while every row is starting or running', () => {
    const statuses = resolveForward(startingForwards([local, remote]), 0, {
      kind: 'running',
      handle: 1,
    });
    expect(anyForwardFailed(statuses)).toBe(false);
  });

  it('is true the moment one row fails, regardless of the others', () => {
    const statuses = resolveForward(startingForwards([local, remote]), 1, {
      kind: 'failed',
      error: { code: 'remoteForwardRefused', port: 9000 },
    });
    expect(anyForwardFailed(statuses)).toBe(true);
  });
});

describe('the handles a disconnect needs to stop', () => {
  it('names only the rows that are actually running', () => {
    let statuses = startingForwards([local, remote, dynamic]);
    statuses = resolveForward(statuses, 0, { kind: 'running', handle: 11 });
    statuses = resolveForward(statuses, 1, { kind: 'failed', error: { code: 'remoteForwardRefused', port: 9000 } });
    statuses = resolveForward(statuses, 2, { kind: 'running', handle: 13 });

    expect(runningForwardHandles(statuses)).toEqual([11, 13]);
  });

  it('is empty before anything has resolved', () => {
    expect(runningForwardHandles(startingForwards([local]))).toEqual([]);
  });
});

describe('dispatching a start by kind', () => {
  it('calls startLocalForward for a local forward', async () => {
    await startForward(42, local);
    expect(startLocalForward).toHaveBeenCalledWith(42, 8080, 'target.internal', 80);
  });

  it('calls startRemoteForward for a remote forward', async () => {
    await startForward(42, remote);
    expect(startRemoteForward).toHaveBeenCalledWith(42, 9000, 'target.internal', 80);
  });

  it('calls startDynamicForward for a dynamic forward, ignoring its absent target', async () => {
    await startForward(42, dynamic);
    expect(startDynamicForward).toHaveBeenCalledWith(42, 1080);
  });
});
