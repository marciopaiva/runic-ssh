/**
 * A session is mounted once, whether Sessions or the map asked for it.
 */

import { describe, expect, it } from 'vitest';

import { mapTerminals, mountedOnce } from '../src/features/map';
import type { Component } from '../src/ipc';

function component(id: string, kind: Component['kind'], host: string): Component {
  return { id, kind, host };
}

describe('what the map mounts', () => {
  it('mounts a terminal for an SSH component whose host is connected, and nothing else', () => {
    const components = [
      component('c1', 'ssh', 's1'),
      component('c2', 'sftp', 's1'),
      component('c3', 'monitor', 's2'),
      component('c4', 'ssh', 's3'),
    ];
    const handles = new Map([
      ['s1', 7],
      ['s2', 8],
    ]);

    expect(mapTerminals(components, handles)).toEqual([{ sessionId: 's1', handle: 7 }]);
  });

  it('never mounts a session twice when Sessions already shows it', () => {
    const merged = mountedOnce(
      [{ sessionId: 's1', handle: 7 }],
      [
        { sessionId: 's1', handle: 7 },
        { sessionId: 's2', handle: 8 },
      ],
    );

    expect(merged).toEqual([
      { sessionId: 's1', handle: 7 },
      { sessionId: 's2', handle: 8 },
    ]);
  });

  it('keeps the order Sessions had, so a terminal that merely moved is not remounted', () => {
    const merged = mountedOnce(
      [
        { sessionId: 's2', handle: 8 },
        { sessionId: 's1', handle: 7 },
      ],
      [{ sessionId: 's1', handle: 7 }],
    );

    expect(merged.map((t) => t.sessionId)).toEqual(['s2', 's1']);
  });
});
