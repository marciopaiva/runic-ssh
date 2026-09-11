/**
 * The map's model: ADR-0064's rules, asserted without a DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SIZE,
  MIN_SIZE,
  addComponent,
  addLocal,
  changeHost,
  componentsOn,
  defaultSize,
  localOn,
  moveComponent,
  moveToLayer,
  newComponentId,
  placeSavedHost,
  removeComponent,
  resetPosition,
  resizeComponent,
  sizeOf,
} from '../src/features/map';
import { EMPTY_WORKSPACE } from '../src/ipc';
import type { Session, Workspace } from '../src/ipc';

function host(id: string): Session {
  return { id, name: id, host: `${id}.internal`, port: 22, user: 'deploy', group: null, credentialId: null, proxyJump: null, kind: 'direct', forwards: [] };
}

const BOOK = [host('s1'), host('s2')];

describe('adding a component', () => {
  it('puts one kind of surface on one saved host', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK, null, undefined, 1);

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.workspace.components).toHaveLength(1);
    expect(added.component.kind).toBe('ssh');
    expect(added.component.host).toBe('s1');
    expect(added.component.layer).toBeUndefined();
  });

  it('refuses a second component of the same kind on the same host', () => {
    const first = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK);
    if (!first.ok) throw new Error('first add should succeed');

    const second = addComponent(first.workspace, 'ssh', 's1', BOOK);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.refusal.reason).toBe('duplicate');
    if (second.refusal.reason === 'duplicate') {
      expect(second.refusal.existing.id).toBe(first.component.id);
    }
  });

  it('lets one host carry an SSH terminal and an SFTP browser', () => {
    const first = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK);
    if (!first.ok) throw new Error('first add should succeed');

    const second = addComponent(first.workspace, 'sftp', 's1', BOOK);

    expect(second.ok).toBe(true);
  });

  it('refuses a host the book does not have', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'ssh', 'gone', BOOK);

    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.refusal.reason).toBe('unknownHost');
  });

  it('never reuses an id, even inside one millisecond', () => {
    const a = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK, null, undefined, 5);
    if (!a.ok) throw new Error('add');
    const b = addComponent(a.workspace, 'sftp', 's1', BOOK, null, undefined, 5);
    if (!b.ok) throw new Error('add');

    expect(a.component.id).not.toBe(b.component.id);
    expect(newComponentId(b.workspace, 5)).not.toBe(a.component.id);
    expect(newComponentId(b.workspace, 5)).not.toBe(b.component.id);
  });

  it('does not touch the workspace it was given', () => {
    const before: Workspace = { ...EMPTY_WORKSPACE };
    addComponent(before, 'ssh', 's1', BOOK);

    expect(before.components).toHaveLength(0);
  });
});

describe('changing a component', () => {
  const start = (() => {
    const a = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK, null, undefined, 1);
    if (!a.ok) throw new Error('add');
    const b = addComponent(a.workspace, 'ssh', 's2', BOOK, 'lab', undefined, 2);
    if (!b.ok) throw new Error('add');
    return { workspace: b.workspace, first: a.component, second: b.component };
  })();

  it('lists a level by its layer, the outermost being null', () => {
    expect(componentsOn(start.workspace, null).map((c) => c.id)).toEqual([start.first.id]);
    expect(componentsOn(start.workspace, 'lab').map((c) => c.id)).toEqual([start.second.id]);
  });

  it('removes a component with every line and membership that named it', () => {
    const linked: Workspace = {
      ...start.workspace,
      links: [{ a: start.first.id, b: start.second.id }],
      visions: [{ id: 'v1', name: 'web', components: [start.first.id, start.second.id], open: true }],
    };

    const after = removeComponent(linked, start.first.id);

    expect(after.components.map((c) => c.id)).toEqual([start.second.id]);
    expect(after.links).toHaveLength(0);
    expect(after.visions[0]?.components).toEqual([start.second.id]);
  });

  it('points a component at another host, unless that host already carries the kind', () => {
    const moved = changeHost(start.workspace, start.first.id, 's2', BOOK);

    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.refusal.reason).toBe('duplicate');

    const freed = removeComponent(start.workspace, start.second.id);
    const retried = changeHost(freed, start.first.id, 's2', BOOK);

    expect(retried.ok).toBe(true);
    if (retried.ok) expect(retried.component.host).toBe('s2');
  });

  it('keeps a position until it is reset', () => {
    const placed = moveComponent(start.workspace, start.first.id, { x: 120, y: -40 });
    expect(placed.components[0]?.position).toEqual({ x: 120, y: -40 });

    const reset = resetPosition(placed, start.first.id);
    expect(reset.components[0]?.position).toBeUndefined();
  });

  it('never sizes a window below the floor, and knows the default', () => {
    expect(sizeOf(start.first)).toEqual(DEFAULT_SIZE.ssh);

    const tiny = resizeComponent(start.workspace, start.first.id, { w: 10, h: 10 });
    expect(tiny.components[0]?.size).toEqual(MIN_SIZE);

    const back = defaultSize(tiny, start.first.id);
    expect(back.components[0]?.size).toBeUndefined();
  });
});

describe('placing a host the editor just saved', () => {
  it('creates the component the picker asked for', () => {
    const next = placeSavedHost(EMPTY_WORKSPACE, { kind: 'ssh', changing: null, layer: null }, 's1', BOOK);
    expect(next?.components.map((one) => [one.kind, one.host])).toEqual([['ssh', 's1']]);
  });

  it('creates it on the layer the map was showing (ADR-0068)', () => {
    const next = placeSavedHost(EMPTY_WORKSPACE, { kind: 'ssh', changing: null, layer: 'lab' }, 's1', BOOK);
    expect(next?.components[0]?.layer).toBe('lab');
  });

  it('points the component being changed at the new host', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'sftp', 's1', BOOK);
    if (!added.ok) throw new Error('fixture');
    const next = placeSavedHost(added.workspace, { kind: null, changing: added.component.id, layer: null }, 's2', BOOK);
    expect(next?.components.map((one) => one.host)).toEqual(['s2']);
  });

  it('leaves the map alone when the editor was only about the host', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK);
    if (!added.ok) throw new Error('fixture');
    expect(placeSavedHost(added.workspace, { kind: null, changing: null, layer: null }, 's1', BOOK)).toBe(added.workspace);
  });

  it('refuses the way the picker would', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK);
    if (!added.ok) throw new Error('fixture');
    /* The same host in the same kind twice, and a host the book has never heard of. */
    expect(placeSavedHost(added.workspace, { kind: 'ssh', changing: null, layer: null }, 's1', BOOK)).toBeNull();
    expect(placeSavedHost(added.workspace, { kind: 'monitor', changing: null, layer: null }, 'nobody', BOOK)).toBeNull();
  });
});

describe('this machine on the map (ADR-0065)', () => {
  it('is added once per level, with no host', () => {
    const first = addLocal(EMPTY_WORKSPACE, null, 1);
    expect(first.ok && first.component).toEqual({ id: 'c_1', kind: 'local' });
    if (!first.ok) return;
    expect(localOn(first.workspace, null)?.id).toBe('c_1');
    const second = addLocal(first.workspace, null, 2);
    expect(!second.ok && second.refusal).toEqual({ reason: 'duplicate', existing: first.component });
    const deeper = addLocal(first.workspace, 'k', 3);
    expect(deeper.ok && deeper.component.layer).toBe('k');
  });

  it('cannot be pointed at a host', () => {
    const withLocal = addLocal(EMPTY_WORKSPACE, null, 1);
    if (!withLocal.ok) throw new Error('unreachable');
    const outcome = changeHost(withLocal.workspace, 'c_1', 's1', BOOK);
    expect(outcome.ok).toBe(false);
  });
});

describe('moving a component between layers (ADR-0068)', () => {
  it('sets the layer and drops the place it had, since a ring position means nothing on another level', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK, null, { x: 40, y: 40 });
    if (!added.ok) throw new Error('fixture');

    const moved = moveToLayer(added.workspace, added.component.id, 'lab');
    const component = moved.components.find((one) => one.id === added.component.id);
    expect(component?.layer).toBe('lab');
    expect(component?.position).toBeUndefined();
  });

  it('drops the layer field entirely for the outermost map, not a null', () => {
    const added = addComponent(EMPTY_WORKSPACE, 'ssh', 's1', BOOK, 'lab');
    if (!added.ok) throw new Error('fixture');

    const moved = moveToLayer(added.workspace, added.component.id, null);
    const component = moved.components.find((one) => one.id === added.component.id);
    expect(component).not.toHaveProperty('layer');
  });
});
