/**
 * Guards the per-forward runtime state a connected session carries
 * (ADR-0054): starting, then running or failed, one row per saved forward.
 *
 * The `*In`/`with*` functions below cover the same state a session's ad-hoc
 * forwards carry (opened from the Tunnels facet rather than saved on the
 * host): a map keyed by session id instead of a bare list, which is what
 * `App.tsx`'s `addAdHocForward`, `removeAdHocForward` and its disconnect
 * cleanup are built from, for both that map and the saved one.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  anyForwardFailed,
  resolveForward,
  resolveForwardIn,
  runningForwardHandles,
  startForward,
  startingForwards,
  withAppendedForward,
  withoutForwardAt,
  withoutSession,
} from '../src/features/status/forwards';
import type { ForwardStatus } from '../src/features/status/forwards';
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

describe('adding a forward to a session already in the map', () => {
  it('appends a starting row to that session alone', () => {
    const map = new Map([['web-01', startingForwards([local])]]);
    const next = withAppendedForward(map, 'web-01', remote);

    expect(next.get('web-01')).toEqual([
      { forward: local, runtime: { kind: 'starting' } },
      { forward: remote, runtime: { kind: 'starting' } },
    ]);
  });

  it('starts a fresh entry for a session with none yet', () => {
    const next = withAppendedForward(new Map(), 'web-01', local);
    expect(next.get('web-01')).toEqual([{ forward: local, runtime: { kind: 'starting' } }]);
  });

  it('leaves every other session in the map exactly as it was', () => {
    const map = new Map([['jump', startingForwards([remote])]]);
    const next = withAppendedForward(map, 'web-01', local);

    expect(next.get('jump')).toBe(map.get('jump'));
  });
});

describe('resolving one row inside a session keyed map', () => {
  it('moves only that row, for only that session', () => {
    const map = new Map([
      ['web-01', startingForwards([local, remote])],
      ['jump', startingForwards([dynamic])],
    ]);
    const next = resolveForwardIn(map, 'web-01', 1, { kind: 'running', handle: 9 });

    expect(next.get('web-01')?.[0]?.runtime).toEqual({ kind: 'starting' });
    expect(next.get('web-01')?.[1]?.runtime).toEqual({ kind: 'running', handle: 9 });
    expect(next.get('jump')).toBe(map.get('jump'));
  });

  it('does nothing for a session that already disconnected', () => {
    /* Its own disconnect deleted the entry before this resolve arrived; the
       forward it belonged to is gone along with it, not a row to revive. */
    const map = new Map<string, readonly ForwardStatus[]>();
    const next = resolveForwardIn(map, 'web-01', 0, { kind: 'running', handle: 9 });

    expect(next).toBe(map);
  });
});

describe('removing one forward from a session keyed map', () => {
  it('drops only that row, keeping the rest of that session', () => {
    const map = new Map([['web-01', startingForwards([local, remote, dynamic])]]);
    const next = withoutForwardAt(map, 'web-01', 1);

    expect(next.get('web-01')).toEqual([
      { forward: local, runtime: { kind: 'starting' } },
      { forward: dynamic, runtime: { kind: 'starting' } },
    ]);
  });

  it('deletes the session entirely once its last row is removed', () => {
    /* An empty array left behind would still answer `.has` truthfully, and
       the Tunnels facet's own badge count reads that as one host worth
       showing rather than none. */
    const map = new Map([['web-01', startingForwards([local])]]);
    const next = withoutForwardAt(map, 'web-01', 0);

    expect(next.has('web-01')).toBe(false);
  });

  it('does nothing for a session with no rows to remove from', () => {
    const map = new Map<string, readonly ForwardStatus[]>();
    const next = withoutForwardAt(map, 'web-01', 0);

    expect(next).toBe(map);
  });
});

describe('clearing a session out of a keyed map on disconnect', () => {
  it('removes that session, whatever state its rows were in', () => {
    const map = new Map([
      ['web-01', startingForwards([local])],
      ['jump', startingForwards([remote])],
    ]);
    const next = withoutSession(map, 'web-01');

    expect(next.has('web-01')).toBe(false);
    expect(next.get('jump')).toBe(map.get('jump'));
  });

  it('is a no-op for a session that was never in the map', () => {
    const map = new Map([['jump', startingForwards([remote])]]);
    const next = withoutSession(map, 'web-01');

    expect(next).toBe(map);
  });
});
