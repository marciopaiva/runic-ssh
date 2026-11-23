import { describe, expect, it } from 'vitest';

import { groupPresets, initialSelection } from '../src/features/fleet/groups';

const live = (id: string, name: string, group: string | null | undefined, handle: number | null) => ({
  session: {
    id,
    name,
    host: `${id}.example`,
    port: 22,
    user: 'deploy',
    group,
    kind: 'direct',
    forwards: [],
  } as never,
  handle: handle as never,
  kind: handle === null ? ('saved' as const) : ('connected' as const),
});

describe('groupPresets', () => {
  it('splits a group into the hosts it can reach and the ones it leaves out', () => {
    const presets = groupPresets([
      live('a', 'web-01', 'prod', 1),
      live('b', 'web-02', 'prod', null),
      live('c', 'web-03', 'prod', 3),
    ]);

    expect(presets).toEqual([{ id: 'prod', name: 'prod', handles: [1, 3], skipped: ['web-02'] }]);
  });

  it('keeps groups apart and in the order they are first seen', () => {
    const presets = groupPresets([
      live('a', 'web-01', 'prod', 1),
      live('b', 'stg-01', 'staging', 2),
      live('c', 'web-02', 'prod', 3),
    ]);

    expect(presets.map((preset) => [preset.name, preset.handles])).toEqual([
      ['prod', [1, 3]],
      ['staging', [2]],
    ]);
  });

  it('ignores hosts with no group, an empty one, or only spaces', () => {
    const presets = groupPresets([
      live('a', 'web-01', null, 1),
      live('b', 'web-02', undefined, 2),
      live('c', 'web-03', '', 3),
      live('d', 'web-04', '   ', 4),
    ]);

    expect(presets).toEqual([]);
  });

  it('lists a group whose hosts are all unconnected, with every one left out', () => {
    const presets = groupPresets([live('a', 'web-01', 'lab', null), live('b', 'web-02', 'lab', null)]);

    expect(presets).toEqual([{ id: 'lab', name: 'lab', handles: [], skipped: ['web-01', 'web-02'] }]);
  });
});

describe('what a fleet run opens with ticked', () => {
  const targets = [{ handle: 1 }, { handle: 2 }, { handle: 3 }];

  it('is every target when nothing was asked for', () => {
    expect([...initialSelection(targets, undefined)]).toEqual([1, 2, 3]);
  });

  it('is the scope the Bar passed, and nothing else', () => {
    expect([...initialSelection(targets, [3, 1])]).toEqual([1, 3]);
  });

  it('drops a handle that is no longer a target and ticks nothing for an empty scope', () => {
    expect([...initialSelection(targets, [2, 99])]).toEqual([2]);
    expect(initialSelection(targets, []).size).toBe(0);
  });
});
