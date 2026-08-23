/**
 * Guards which terminals stay mounted.
 *
 * ADR-0014. Before it, one terminal was mounted for the active handle and
 * rebuilt on every switch — which destroyed the scrollback and made the core
 * open a second shell on the same connection, abandoning the first (#94). Four
 * round trips between two tabs left nine shells alive on the host.
 *
 * The failure is invisible from the markup and only appears once somebody
 * switches tabs, so the decision is a pure function and asserted here.
 */

import { describe, expect, it } from 'vitest';

import { mountedTerminals } from '../src/features/terminal';
import type { Tab } from '../src/features/chrome/tabs';

function tab(sessionId: string, handle: number | null): Tab {
  return {
    sessionId,
    title: sessionId,
    kind: handle === null ? 'connecting' : 'connected',
    handle,
  };
}

describe('which terminals stay mounted', () => {
  it('mounts one per open session, not one for the active tab', () => {
    /* The whole point: `b` keeps its terminal while `a` is being looked at. */
    const mounted = mountedTerminals([tab('a', 1), tab('b', 2)]);

    expect(mounted.map((terminal) => terminal.sessionId)).toEqual(['a', 'b']);
  });

  it('carries the handle each terminal attaches to', () => {
    expect(mountedTerminals([tab('a', 7)])).toEqual([{ sessionId: 'a', handle: 7 }]);
  });

  it('mounts nothing for a tab that is still connecting', () => {
    /* A connecting tab exists so a failure has somewhere to be reported. It
       has no handle, and a terminal with nothing to attach to would open one
       the moment a handle arrived, from a component mounted before there was
       anything to open. */
    expect(mountedTerminals([tab('a', null)])).toEqual([]);
  });

  it('keeps the strip order', () => {
    const mounted = mountedTerminals([tab('a', 1), tab('b', null), tab('c', 2)]);

    expect(mounted.map((terminal) => terminal.sessionId)).toEqual(['a', 'c']);
  });

  it('mounts nothing when nothing is open', () => {
    expect(mountedTerminals([])).toEqual([]);
  });

  it('gives every terminal a distinct session to key on', () => {
    /* Two mounted terminals sharing a React key is one of them silently
       reusing the other's xterm instance across a re-render. */
    const mounted = mountedTerminals([tab('a', 1), tab('b', 2), tab('c', 3)]);
    const keys = new Set(mounted.map((terminal) => terminal.sessionId));

    expect(keys.size).toBe(mounted.length);
  });
});
