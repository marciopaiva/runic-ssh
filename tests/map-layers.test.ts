/**
 * The layer: ADR-0068's rules, asserted without a DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  addLayer,
  addMember,
  addVision,
  findLayer,
  moveLayer,
  newLayerId,
  removeLayer,
  renameLayer,
} from '../src/features/map';
import { EMPTY_WORKSPACE } from '../src/ipc';
import type { Component, Workspace } from '../src/ipc';

function component(id: string, layer?: string): Component {
  return { id, kind: 'ssh', host: `s-${id}`, ...(layer === undefined ? {} : { layer }), position: { x: 10, y: 10 } };
}

describe('a layer', () => {
  it('is created named, where asked', () => {
    const outcome = addLayer(EMPTY_WORKSPACE, '  Lab ', { x: 40, y: -20 }, 3);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.layer).toEqual({ id: 'l_3', name: 'Lab', position: { x: 40, y: -20 } });
    expect(outcome.workspace.layers).toHaveLength(1);
  });

  it('is placed by the map when asked with none', () => {
    const outcome = addLayer(EMPTY_WORKSPACE, 'Lab', undefined, 3);
    expect(outcome.ok && 'position' in outcome.layer).toBe(false);
  });

  it('refuses an empty name, and one longer than the store takes', () => {
    expect(addLayer(EMPTY_WORKSPACE, '   ').ok).toBe(false);
    expect(addLayer(EMPTY_WORKSPACE, 'x'.repeat(81)).ok).toBe(false);
  });

  it('refuses a name another layer already has, trimmed the way the store compares them', () => {
    const first = addLayer(EMPTY_WORKSPACE, 'Lab', undefined, 1);
    if (!first.ok) throw new Error('refused');

    const outcome = addLayer(first.workspace, '  Lab  ', undefined, 2);
    expect(outcome).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('gets an id that no layer already has', () => {
    const first = addLayer(EMPTY_WORKSPACE, 'a', undefined, 5);
    if (!first.ok) throw new Error('refused');
    const second = addLayer(first.workspace, 'b', undefined, 5);
    expect(second.ok && second.layer.id).toBe('l_5_1');
  });

  it('is found by id', () => {
    const made = addLayer(EMPTY_WORKSPACE, 'Lab', undefined, 1);
    if (!made.ok) throw new Error('refused');
    expect(findLayer(made.workspace, 'l_1')?.name).toBe('Lab');
    expect(findLayer(made.workspace, 'gone')).toBeUndefined();
  });

  it('is renamed trimmed, refusing a collision or an empty name and leaving the old one', () => {
    const made = addLayer(EMPTY_WORKSPACE, 'Lab', undefined, 1);
    if (!made.ok) throw new Error('refused');
    const withSecond = addLayer(made.workspace, 'Prod', undefined, 2);
    if (!withSecond.ok) throw new Error('refused');

    const renamed = renameLayer(withSecond.workspace, 'l_1', ' Staging ');
    expect(renamed.ok && renamed.workspace.layers.find((one) => one.id === 'l_1')?.name).toBe('Staging');

    const collided = renameLayer(withSecond.workspace, 'l_1', 'Prod');
    expect(collided).toEqual({ ok: false, reason: 'duplicate' });
    expect(withSecond.workspace.layers.find((one) => one.id === 'l_1')?.name).toBe('Lab');

    expect(renameLayer(withSecond.workspace, 'l_1', '').ok).toBe(false);
  });

  it('renames itself without colliding with its own name', () => {
    const made = addLayer(EMPTY_WORKSPACE, 'Lab', undefined, 1);
    if (!made.ok) throw new Error('refused');

    const same = renameLayer(made.workspace, 'l_1', 'Lab');
    expect(same.ok).toBe(true);
  });

  it('moves to where the monolith was left', () => {
    const made = addLayer(EMPTY_WORKSPACE, 'Lab', undefined, 1);
    if (!made.ok) throw new Error('refused');

    const moved = moveLayer(made.workspace, 'l_1', { x: 900, y: -40 });
    expect(moved.layers[0]?.position).toEqual({ x: 900, y: -40 });
  });
});

describe('removing a layer', () => {
  const WITH_LAYER: Workspace = {
    ...EMPTY_WORKSPACE,
    layers: [{ id: 'l_1', name: 'Lab', position: { x: 0, y: 0 } }],
    components: [component('c1', 'l_1'), component('c2', 'l_1'), component('c3')],
  };

  it('drops the layer itself', () => {
    const after = removeLayer(WITH_LAYER, 'l_1');
    expect(after.layers).toEqual([]);
  });

  it('frees every component that named it, dropping its position so the ring places it fresh', () => {
    const after = removeLayer(WITH_LAYER, 'l_1');

    const c1 = after.components.find((one) => one.id === 'c1');
    expect(c1?.layer).toBeUndefined();
    expect(c1?.position).toBeUndefined();
  });

  it('leaves a component on another level untouched', () => {
    const after = removeLayer(WITH_LAYER, 'l_1');

    const c3 = after.components.find((one) => one.id === 'c3');
    expect(c3?.layer).toBeUndefined();
    expect(c3?.position).toEqual({ x: 10, y: 10 });
  });

  it('frees a vision on the layer, dropping its position, and turns a pinned member into a flowing one', () => {
    const outcome = addVision(WITH_LAYER, 'staging', 'l_1', { x: 5, y: 5 }, 9);
    if (!outcome.ok) throw new Error('refused');
    const withMember = addMember(outcome.workspace, 'v_9', 'c1', { x: 20, y: 20 });

    const after = removeLayer(withMember, 'l_1');

    const vision = after.visions.find((one) => one.id === 'v_9');
    expect(vision?.layer).toBeUndefined();
    expect(vision?.position).toBeUndefined();
    expect(vision?.components).toEqual(['c1']);
    const member = after.components.find((one) => one.id === 'c1');
    expect(member?.layer).toBeUndefined();
    expect(member?.position).toBeUndefined();
  });

  it('is a no-op for a layer that is not there', () => {
    expect(removeLayer(WITH_LAYER, 'gone')).toEqual(WITH_LAYER);
  });
});

describe('newLayerId', () => {
  it('never repeats an id already taken', () => {
    const workspace: Workspace = { ...EMPTY_WORKSPACE, layers: [{ id: 'l_1', name: 'one' }] };
    expect(newLayerId(workspace, 1)).toBe('l_1_1');
  });
});
