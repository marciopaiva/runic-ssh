import { describe, expect, it } from 'vitest';

import type { Component } from '../src/ipc';
import { visionPresets } from '../src/features/fleet/visions';

const session = (id: string, name: string) =>
  ({ id, name, host: `${id}.example`, port: 22, user: 'deploy', kind: 'direct', forwards: [] }) as never;
const live = (id: string, name: string, handle: number | null) => ({
  session: session(id, name),
  handle: handle as never,
  kind: handle === null ? ('saved' as const) : ('connected' as const),
});

const component = (id: string, host?: string): Component =>
  host === undefined ? { id, kind: 'ssh' } : { id, kind: 'ssh', host };

describe('visionPresets', () => {
  it('splits a vision into the hosts it can reach and the ones it leaves out', () => {
    const presets = visionPresets(
      {
        components: [component('c1', 'a'), component('c2', 'b'), component('c3', 'c')],
        visions: [{ id: 'v1', name: 'prod', components: ['c1', 'c2', 'c3'], open: true }],
      },
      [live('a', 'web-01', 1), live('b', 'web-02', null), live('c', 'web-03', 3)],
    );

    expect(presets).toEqual([{ id: 'v1', name: 'prod', handles: [1, 3], skipped: ['web-02'] }]);
  });

  it('counts a host once however many components open it', () => {
    const [preset] = visionPresets(
      {
        components: [component('c1', 'a'), component('c2', 'a')],
        visions: [{ id: 'v1', name: 'prod', components: ['c1', 'c2'], open: true }],
      },
      [live('a', 'web-01', 1)],
    );

    expect(preset?.handles).toEqual([1]);
  });

  it('ignores a component with no host and a vision with nothing to reach', () => {
    const presets = visionPresets(
      {
        components: [component('c1'), component('c2', 'gone')],
        visions: [{ id: 'v1', name: 'empty', components: ['c1', 'c2'], open: false }],
      },
      [],
    );

    expect(presets).toEqual([]);
  });
});
