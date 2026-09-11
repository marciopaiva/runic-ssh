/**
 * Lines between components: ADR-0065's rules, asserted without a DOM.
 *
 * A line joins two components of one family; a terminal line has no
 * direction; the connected sets of terminal links are the map's groups; and
 * ADR-0019's rules hold on a set unchanged: off by default, one receiving
 * window is none, a muted or collapsed window is spared, a keystroke from a
 * window that is not receiving reaches only itself.
 */

import { describe, expect, it } from 'vitest';

import {
  addLink,
  canLink,
  destinationsOf,
  lineKey,
  linkedSet,
  linkedSets,
  mapInputTargets,
  mapReceiving,
  outsideLink,
  removeComponent,
  removeLink,
  setKey,
  switchState,
  visibleMidpoint,
} from '../src/features/map';
import { EMPTY_WORKSPACE } from '../src/ipc';
import type { Component, Workspace } from '../src/ipc';

function ssh(id: string, host: string = `h_${id}`): Component {
  return { id, kind: 'ssh', host };
}
function sftp(id: string, host: string = `h_${id}`): Component {
  return { id, kind: 'sftp', host };
}
function monitor(id: string, host: string = `h_${id}`): Component {
  return { id, kind: 'monitor', host };
}
function local(id: string): Component {
  return { id, kind: 'local' };
}

function map(components: readonly Component[], links: readonly { a: string; b: string }[] = []): Workspace {
  return { ...EMPTY_WORKSPACE, components, links };
}

const THREE = map([ssh('t1'), ssh('t2'), ssh('t3')]);

describe('a line may join', () => {
  it('two terminals, in either order, once', () => {
    expect(canLink(THREE, 't1', 't2')).toBeNull();
    const linked = addLink(THREE, 't1', 't2');
    expect(linked.ok && linked.workspace.links).toEqual([{ a: 't1', b: 't2' }]);
    if (!linked.ok) return;
    expect(canLink(linked.workspace, 't1', 't2')).toEqual({ reason: 'duplicate' });
    expect(canLink(linked.workspace, 't2', 't1')).toEqual({ reason: 'duplicate' });
  });

  it('two file browsers, once per direction', () => {
    const files = map([sftp('f1'), sftp('f2')], [{ a: 'f1', b: 'f2' }]);
    expect(canLink(files, 'f1', 'f2')).toEqual({ reason: 'duplicate' });
    expect(canLink(files, 'f2', 'f1')).toBeNull();
  });

  it('this machine with a file browser either way, never with itself', () => {
    const files = map([local('l1'), local('l2'), sftp('f1'), ssh('t1')]);
    expect(canLink(files, 'l1', 'f1')).toBeNull();
    expect(canLink(files, 'f1', 'l1')).toBeNull();
    expect(canLink(files, 'l1', 'l2')).toEqual({ reason: 'local' });
    expect(canLink(files, 't1', 'l1')).toEqual({ reason: 'family' });
  });

  it('knows where a file browser sends, in the order the lines were drawn', () => {
    const files = map([local('l1'), sftp('f1'), sftp('f2')], [
      { a: 'l1', b: 'f2' },
      { a: 'f1', b: 'l1' },
      { a: 'l1', b: 'f1' },
    ]);
    expect(destinationsOf(files, 'l1')).toEqual(['f2', 'f1']);
    expect(destinationsOf(files, 'f1')).toEqual(['l1']);
    expect(destinationsOf(files, 'f2')).toEqual([]);
  });

  it('never a terminal with a file browser, and never a monitor', () => {
    const mixed = map([ssh('t1'), sftp('f1'), monitor('m1')]);
    expect(canLink(mixed, 't1', 'f1')).toEqual({ reason: 'family' });
    expect(canLink(mixed, 't1', 'm1')).toEqual({ reason: 'family' });
    expect(canLink(mixed, 'm1', 'm1')).toEqual({ reason: 'self' });
  });

  it('never a component to itself, and never one that is not there', () => {
    expect(canLink(THREE, 't1', 't1')).toEqual({ reason: 'self' });
    expect(canLink(THREE, 't1', 'nope')).toEqual({ reason: 'unknown' });
    const refused = addLink(THREE, 't1', 'nope');
    expect(refused.ok).toBe(false);
  });
});

describe('a line is removed', () => {
  it('by naming either end', () => {
    const linked = map([ssh('t1'), ssh('t2')], [{ a: 't1', b: 't2' }]);
    expect(removeLink(linked, 't2', 't1').links).toEqual([]);
    expect(removeLink(linked, 't1', 't2').links).toEqual([]);
  });

  it('with the component that anchored it', () => {
    const linked = map([ssh('t1'), ssh('t2'), ssh('t3')], [{ a: 't1', b: 't2' }, { a: 't2', b: 't3' }]);
    expect(removeComponent(linked, 't2').links).toEqual([]);
  });

  it('has one key whichever end is named first', () => {
    expect(lineKey({ a: 't2', b: 't1' })).toBe(lineKey({ a: 't1', b: 't2' }));
  });
});

describe('the connected sets of terminal lines', () => {
  const chain = map([ssh('t1'), ssh('t2'), ssh('t3'), ssh('t4'), sftp('f1'), sftp('f2')], [
    { a: 't1', b: 't2' },
    { a: 't3', b: 't2' },
    { a: 'f1', b: 'f2' },
  ]);

  it('follow every link, whichever way it was drawn', () => {
    expect(linkedSets(chain)).toEqual([['t1', 't2', 't3']]);
    expect(linkedSet(chain, 't3')).toEqual(['t1', 't2', 't3']);
  });

  it('leave a terminal with no line in a set of one, and file browsers out', () => {
    expect(linkedSet(chain, 't4')).toEqual(['t4']);
    expect(linkedSet(chain, 'f1')).toEqual(['f1']);
  });

  it('are keyed by their members, so a changed set is a different switch (ADR-0019)', () => {
    const key = setKey(linkedSet(chain, 't1'));
    const grown = addLink(chain, 't4', 't1');
    expect(grown.ok && setKey(linkedSet(grown.workspace, 't1'))).not.toBe(key);
    expect(setKey(['t1', 't2'])).toBe(setKey(['t2', 't1']));
  });
});

describe('where a keystroke typed in a map window goes', () => {
  const linked = map([ssh('t1', 'h1'), ssh('t2', 'h2'), ssh('t3', 'h3'), ssh('t4', 'h4')], [
    { a: 't1', b: 't2' },
    { a: 't2', b: 't3' },
  ]);
  const key = setKey(['t1', 't2', 't3']);
  const all = new Set(['t1', 't2', 't3', 't4']);
  const none = new Set<string>();

  it('reaches only its own host with nothing armed', () => {
    expect(mapInputTargets(linked, 'h1', none, none, all)).toEqual(['h1']);
    expect(mapReceiving(linked, none, none, all)).toEqual([]);
  });

  it('reaches every open window on the armed set', () => {
    const armed = new Set([key]);
    expect(mapInputTargets(linked, 'h1', armed, none, all)).toEqual(['h1', 'h2', 'h3']);
    expect(mapReceiving(linked, armed, none, all)).toEqual(['t1', 't2', 't3']);
  });

  it('spares a muted window and a collapsed one, which reach only themselves', () => {
    const armed = new Set([key]);
    const muted = new Set(['t2']);
    const open = new Set(['t1', 't2', 't3']);
    expect(mapInputTargets(linked, 'h1', armed, muted, open)).toEqual(['h1', 'h3']);
    expect(mapInputTargets(linked, 'h2', armed, muted, open)).toEqual(['h2']);
    const collapsed = new Set(['t1', 't2']);
    expect(mapInputTargets(linked, 'h1', armed, none, collapsed)).toEqual(['h1', 'h2']);
    expect(mapInputTargets(linked, 'h3', armed, none, collapsed)).toEqual(['h3']);
  });

  it('treats one receiving window as no broadcast at all', () => {
    const armed = new Set([key]);
    const muted = new Set(['t2', 't3']);
    expect(mapInputTargets(linked, 'h1', armed, muted, all)).toEqual(['h1']);
    expect(mapReceiving(linked, armed, muted, all)).toEqual([]);
  });

  it('never crosses to a set that is not armed, nor from a host off the map', () => {
    const armed = new Set([setKey(['t4'])]);
    expect(mapInputTargets(linked, 'h1', armed, none, all)).toEqual(['h1']);
    expect(mapInputTargets(linked, 'h_elsewhere', new Set([key]), none, all)).toEqual(['h_elsewhere']);
  });

  it('ignores a key for a set that no longer exists', () => {
    const stale = new Set([setKey(['t1', 't2'])]);
    expect(mapInputTargets(linked, 'h1', stale, none, all)).toEqual(['h1']);
  });
});

describe('the switch on a set', () => {
  const pair = ['t1', 't2'];
  const armed = new Set([setKey(pair)]);

  it('is off until the set is armed', () => {
    expect(switchState(pair, new Set(), ['t1', 't2'])).toBe('off');
    expect(switchState(['t1'], armed, [])).toBe('off');
  });

  it('is on while somebody on the set receives', () => {
    expect(switchState(pair, armed, ['t1', 't2'])).toBe('on');
  });

  it('is idle when the set is armed and nobody receives: one window spared itself', () => {
    const two = map([ssh('t1'), ssh('t2')], [{ a: 't1', b: 't2' }]);
    const receiving = mapReceiving(two, armed, new Set(['t2']), new Set(['t1', 't2']));
    expect(receiving).toEqual([]);
    expect(switchState(pair, armed, receiving)).toBe('idle');
  });
});

describe('where a line shows its handle', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 320, y: 0 };

  it('at the midpoint when nothing covers the line', () => {
    expect(visibleMidpoint(from, to, [])).toEqual({ x: 160, y: 0 });
  });

  it('in the middle of the longest uncovered part', () => {
    const window = { left: 100, top: -10, width: 120, height: 20 };
    const at = visibleMidpoint(from, to, [window]);
    expect(at).not.toBeNull();
    expect(at?.x).toBeCloseTo(50, 0);
  });

  it('nowhere when a window covers all of it', () => {
    expect(visibleMidpoint(from, to, [{ left: -10, top: -10, width: 340, height: 20 }])).toBeNull();
  });
});

describe('while a line is being drawn', () => {
  const mixed = map([ssh('t1'), ssh('t2'), sftp('f1'), monitor('m1')], [{ a: 't1', b: 't2' }]);

  it('the origin, the other family and what is already joined are out of reach', () => {
    expect(outsideLink(mixed, 't1', 't1')).toBe(true);
    expect(outsideLink(mixed, 't1', 'f1')).toBe(true);
    expect(outsideLink(mixed, 't1', 'm1')).toBe(true);
    expect(outsideLink(mixed, 't1', 't2')).toBe(true);
  });

  it('a free member of the same family is not', () => {
    const three = map([ssh('t1'), ssh('t2'), ssh('t3')], [{ a: 't1', b: 't2' }]);
    expect(outsideLink(three, 't1', 't3')).toBe(false);
  });
});
